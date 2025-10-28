const express = require('express');
const axios = require('axios');
const router = express.Router();

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const GOOGLE_PLACES_BASE_URL = 'https://maps.googleapis.com/maps/api/place';

// Facility type mappings for accurate healthcare facility search
const FACILITY_TYPE_CONFIG = {
  'emergency': {
    keyword: 'emergency room',
    types: ['hospital', 'emergency'],
    rankBy: 'distance', // Closest ER is critical
    requiredInName: ['emergency', 'er ', 'trauma'],
    radius: 25000 // 25km - willing to go further for ER
  },
  'urgent_care': {
    keyword: 'urgent care',
    types: ['doctor', 'health'],
    rankBy: 'prominence',
    // Don't filter by name - trust Google's keyword matching with 'urgent care'
    requiredInName: [],
    excludeInName: [],
    radius: 16000 // 10 miles in meters
  },
  'primary_care': {
    keyword: 'primary care doctor',
    types: ['doctor', 'health'],
    rankBy: 'prominence',
    requiredInName: ['clinic', 'medical', 'family practice', 'internal medicine', 'primary care'],
    excludeInName: ['urgent care', 'emergency', 'hospital'],
    radius: 15000 // 15km
  },
  'hospital': {
    keyword: 'hospital',
    types: ['hospital'],
    rankBy: 'prominence',
    radius: 25000
  }
};

/**
 * Helper function to filter facilities by name requirements
 */
function filterFacilitiesByType(facilities, facilityConfig) {
  return facilities.filter(place => {
    const nameLower = place.name.toLowerCase();

    // Check if name contains required keywords
    const hasRequiredKeyword = facilityConfig.requiredInName?.some(keyword =>
      nameLower.includes(keyword.toLowerCase())
    );

    // Check if name contains excluded keywords
    const hasExcludedKeyword = facilityConfig.excludeInName?.some(keyword =>
      nameLower.includes(keyword.toLowerCase())
    );

    // For facilities with required keywords, must match
    if (facilityConfig.requiredInName && facilityConfig.requiredInName.length > 0) {
      return hasRequiredKeyword && !hasExcludedKeyword;
    }

    // For facilities without specific requirements, just exclude
    return !hasExcludedKeyword;
  });
}

/**
 * Nearby Search - Find healthcare facilities near a location
 * GET /api/places/nearby
 * Query params: latitude, longitude, facilityType (emergency|urgent_care|primary_care|hospital)
 */
router.get('/nearby', async (req, res, next) => {
  try {
    const { latitude, longitude, facilityType } = req.query;

    // Validate required parameters
    if (!latitude || !longitude) {
      return res.status(400).json({
        error: 'Missing required parameters: latitude, longitude'
      });
    }

    // Get facility configuration
    const facilityConfig = FACILITY_TYPE_CONFIG[facilityType] || FACILITY_TYPE_CONFIG['hospital'];
    const searchRadius = facilityConfig.radius;

    console.log(`Searching for ${facilityType || 'hospital'} facilities near ${latitude},${longitude} within ${searchRadius}m`);

    let allResults = [];

    // Strategy 1: Nearby Search with keyword
    const nearbyResponse = await axios.get(`${GOOGLE_PLACES_BASE_URL}/nearbysearch/json`, {
      params: {
        location: `${latitude},${longitude}`,
        radius: searchRadius,
        keyword: facilityConfig.keyword,
        type: facilityConfig.types[0],
        key: GOOGLE_MAPS_API_KEY
      }
    });

    if (nearbyResponse.data.status === 'OK') {
      console.log(`Nearby search found ${nearbyResponse.data.results.length} results`);
      allResults = allResults.concat(nearbyResponse.data.results);
    }

    // Strategy 2: Text Search for broader coverage (especially for urgent care)
    if (facilityType === 'urgent_care') {
      const textResponse = await axios.get(`${GOOGLE_PLACES_BASE_URL}/textsearch/json`, {
        params: {
          query: `urgent care near ${latitude},${longitude}`,
          location: `${latitude},${longitude}`,
          radius: searchRadius,
          key: GOOGLE_MAPS_API_KEY
        }
      });

      if (textResponse.data.status === 'OK') {
        console.log(`Text search found ${textResponse.data.results.length} additional results`);
        allResults = allResults.concat(textResponse.data.results);
      }
    }

    // Remove duplicates by place_id
    const uniqueResults = Array.from(
      new Map(allResults.map(place => [place.place_id, place])).values()
    );

    const response = { data: { ...nearbyResponse.data, results: uniqueResults } };

    // Check for API errors
    if (response.data.status === 'ZERO_RESULTS') {
      return res.json({
        results: [],
        status: 'ZERO_RESULTS',
        facilityType: facilityType
      });
    }

    if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
      console.error('Google Places API error:', response.data.status, response.data.error_message);
      return res.status(500).json({
        error: `Google Places API error: ${response.data.status}`,
        message: response.data.error_message
      });
    }

    console.log(`Google returned ${response.data.results.length} raw results before filtering`);

    // Filter results to ensure they match the facility type
    let filteredResults = filterFacilitiesByType(response.data.results, facilityConfig);

    // Sort by distance (calculated from lat/lng)
    const userLat = parseFloat(latitude);
    const userLng = parseFloat(longitude);

    filteredResults = filteredResults.map(place => {
      const placeLat = place.geometry.location.lat;
      const placeLng = place.geometry.location.lng;
      const distance = calculateDistance(userLat, userLng, placeLat, placeLng);
      return { ...place, distance };
    }).sort((a, b) => a.distance - b.distance);

    console.log(`Found ${filteredResults.length} ${facilityType || 'hospital'} facilities`);

    // Return successful results
    res.json({
      results: filteredResults,
      status: response.data.status,
      facilityType: facilityType,
      searchRadius: searchRadius,
      next_page_token: response.data.next_page_token
    });

  } catch (error) {
    console.error('Error in /nearby:', error.message);
    next(error);
  }
});

/**
 * Calculate distance between two lat/lng points (Haversine formula)
 * Returns distance in meters
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

/**
 * Place Details - Get detailed information about a specific place
 * GET /api/places/details/:placeId
 */
router.get('/details/:placeId', async (req, res, next) => {
  try {
    const { placeId } = req.params;

    if (!placeId) {
      return res.status(400).json({
        error: 'Missing required parameter: placeId'
      });
    }

    console.log(`Fetching details for place: ${placeId}`);

    // Request specific fields to optimize API usage and costs
    const fields = 'place_id,name,formatted_address,formatted_phone_number,geometry,rating,opening_hours,website,types,vicinity,business_status';

    const response = await axios.get(`${GOOGLE_PLACES_BASE_URL}/details/json`, {
      params: {
        place_id: placeId,
        fields: fields,
        key: GOOGLE_MAPS_API_KEY
      }
    });

    if (response.data.status !== 'OK') {
      console.error('Google Places API error:', response.data.status);
      return res.status(500).json({
        error: `Google Places API error: ${response.data.status}`,
        message: response.data.error_message
      });
    }

    res.json({
      result: response.data.result,
      status: response.data.status
    });

  } catch (error) {
    console.error('Error in /details:', error.message);
    next(error);
  }
});

/**
 * Geocoding - Convert address to coordinates
 * GET /api/places/geocode
 * Query params: address
 */
router.get('/geocode', async (req, res, next) => {
  try {
    const { address } = req.query;

    if (!address) {
      return res.status(400).json({
        error: 'Missing required parameter: address'
      });
    }

    console.log(`Geocoding address: ${address}`);

    const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
      params: {
        address: address,
        key: GOOGLE_MAPS_API_KEY
      }
    });

    if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
      console.error('Geocoding API error:', response.data.status);
      return res.status(500).json({
        error: `Geocoding API error: ${response.data.status}`
      });
    }

    res.json({
      results: response.data.results,
      status: response.data.status
    });

  } catch (error) {
    console.error('Error in /geocode:', error.message);
    next(error);
  }
});

/**
 * Reverse Geocoding - Convert coordinates to address
 * GET /api/places/reverse-geocode
 * Query params: latitude, longitude
 */
router.get('/reverse-geocode', async (req, res, next) => {
  try {
    const { latitude, longitude } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({
        error: 'Missing required parameters: latitude, longitude'
      });
    }

    console.log(`Reverse geocoding: ${latitude},${longitude}`);

    const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
      params: {
        latlng: `${latitude},${longitude}`,
        key: GOOGLE_MAPS_API_KEY
      }
    });

    if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
      console.error('Reverse geocoding API error:', response.data.status);
      return res.status(500).json({
        error: `Reverse geocoding API error: ${response.data.status}`
      });
    }

    res.json({
      results: response.data.results,
      status: response.data.status
    });

  } catch (error) {
    console.error('Error in /reverse-geocode:', error.message);
    next(error);
  }
});

/**
 * Directions - Get directions between two points
 * GET /api/places/directions
 * Query params: origin, destination, mode (optional)
 */
router.get('/directions', async (req, res, next) => {
  try {
    const { origin, destination, mode } = req.query;

    if (!origin || !destination) {
      return res.status(400).json({
        error: 'Missing required parameters: origin, destination'
      });
    }

    const travelMode = mode || 'driving';

    console.log(`Getting directions from ${origin} to ${destination} (${travelMode})`);

    const response = await axios.get('https://maps.googleapis.com/maps/api/directions/json', {
      params: {
        origin: origin,
        destination: destination,
        mode: travelMode,
        key: GOOGLE_MAPS_API_KEY
      }
    });

    if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
      console.error('Directions API error:', response.data.status);
      return res.status(500).json({
        error: `Directions API error: ${response.data.status}`
      });
    }

    res.json({
      routes: response.data.routes,
      status: response.data.status
    });

  } catch (error) {
    console.error('Error in /directions:', error.message);
    next(error);
  }
});

module.exports = router;
