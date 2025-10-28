import { APP_CONFIG } from '@/shared/constants/AppConstants';
import { InsuranceVerification, BenefitDetails } from '@/shared/types';

export class InsuranceService {
  private static pverifyApiKey = process.env.EXPO_PUBLIC_PVERIFY_API_KEY;
  private static eligibleApiKey = process.env.EXPO_PUBLIC_ELIGIBLE_API_KEY;

  // Cache for insurance verification to avoid repeated API calls
  private static verificationCache = new Map<string, { data: InsuranceVerification; timestamp: number }>();

  static async verifyInsurance(
    memberId: string,
    providerId: string,
    dateOfBirth: string,
    lastName: string
  ): Promise<{ success: boolean; data?: InsuranceVerification; error?: string }> {
    try {
      // Check cache first
      const cacheKey = `${memberId}_${providerId}`;
      const cached = this.verificationCache.get(cacheKey);
      const now = Date.now();

      if (cached && (now - cached.timestamp) < APP_CONFIG.INSURANCE.VERIFICATION_CACHE_DURATION) {
        return { success: true, data: cached.data };
      }

      // Use pVerify API for insurance verification
      const verificationData = await this.callPVerifyAPI({
        memberId,
        providerId,
        dateOfBirth,
        lastName,
      });

      if (verificationData) {
        // Cache the result
        this.verificationCache.set(cacheKey, {
          data: verificationData,
          timestamp: now
        });

        return { success: true, data: verificationData };
      }

      return { success: false, error: 'Unable to verify insurance information' };
    } catch (error) {
      console.error('Insurance verification error:', error);
      return { success: false, error: 'Insurance verification service unavailable' };
    }
  }

  static async findInNetworkProviders(
    providerId: string,
    specialty: string,
    zipCode: string,
    radius: number = 25
  ): Promise<{ success: boolean; providers?: any[]; error?: string }> {
    try {
      const response = await fetch('https://api.pverify.com/api/providers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.pverifyApiKey}`,
        },
        body: JSON.stringify({
          payerId: providerId,
          specialty: specialty,
          zipCode: zipCode,
          radius: radius,
          limit: 50
        }),
      });

      if (!response.ok) {
        throw new Error(`Provider search failed: ${response.statusText}`);
      }

      const data = await response.json();
      return { success: true, providers: data.providers || [] };
    } catch (error) {
      console.error('Provider search error:', error);
      return { success: false, error: 'Provider search service unavailable' };
    }
  }

  static async getCostEstimate(
    memberId: string,
    providerId: string,
    serviceCode: string,
    providerType: 'primary_care' | 'urgent_care' | 'emergency' | 'specialist'
  ): Promise<{ success: boolean; estimate?: number; copay?: number; error?: string }> {
    try {
      const response = await fetch('https://api.eligible.com/v1.5/coverage/cost_estimates.json', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.eligibleApiKey}`,
        },
        body: JSON.stringify({
          member: {
            id: memberId
          },
          provider: {
            id: providerId
          },
          service: {
            cpt_code: serviceCode,
            service_type: providerType
          }
        }),
      });

      if (!response.ok) {
        throw new Error(`Cost estimate failed: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        success: true,
        estimate: data.cost_estimate?.total || 0,
        copay: data.cost_estimate?.copay || 0
      };
    } catch (error) {
      console.error('Cost estimate error:', error);
      return { success: false, error: 'Cost estimate service unavailable' };
    }
  }

  static async checkPreauthorization(
    memberId: string,
    serviceCode: string,
    providerId: string
  ): Promise<{ success: boolean; required?: boolean; status?: string; error?: string }> {
    try {
      const response = await fetch('https://api.pverify.com/api/preauth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.pverifyApiKey}`,
        },
        body: JSON.stringify({
          memberId,
          serviceCode,
          providerId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Preauthorization check failed: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        success: true,
        required: data.preauth_required || false,
        status: data.status || 'not_required'
      };
    } catch (error) {
      console.error('Preauthorization check error:', error);
      return { success: false, error: 'Preauthorization service unavailable' };
    }
  }

  // Mock implementation for demo purposes
  static async getMockInsuranceVerification(memberId: string): Promise<InsuranceVerification> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    return {
      memberId,
      isActive: true,
      planDetails: {
        planName: 'Health Plus PPO',
        planType: 'PPO',
        effectiveDate: new Date('2024-01-01'),
      },
      benefits: {
        primaryCare: {
          copay: 25,
          deductibleApplies: false,
          coverageLevel: 'covered',
        },
        urgentCare: {
          copay: 50,
          deductibleApplies: false,
          coverageLevel: 'covered',
        },
        emergency: {
          copay: 300,
          deductibleApplies: true,
          coverageLevel: 'covered',
        },
        specialist: {
          copay: 50,
          deductibleApplies: false,
          coverageLevel: 'covered',
        },
        prescription: {
          copay: 10,
          coinsurance: 20,
          deductibleApplies: false,
          coverageLevel: 'covered',
        },
        preventive: {
          copay: 0,
          deductibleApplies: false,
          coverageLevel: 'covered',
        },
      },
      deductible: {
        individual: 1500,
        family: 3000,
        met: 500,
        remaining: 1000,
      },
      outOfPocketMax: {
        individual: 6000,
        family: 12000,
        met: 800,
        remaining: 5200,
      },
      verifiedAt: new Date(),
    };
  }

  private static async callPVerifyAPI(params: {
    memberId: string;
    providerId: string;
    dateOfBirth: string;
    lastName: string;
  }): Promise<InsuranceVerification | null> {
    try {
      const response = await fetch('https://api.pverify.com/api/eligibility', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.pverifyApiKey}`,
        },
        body: JSON.stringify({
          member: {
            id: params.memberId,
            first_name: 'Patient',
            last_name: params.lastName,
            dob: params.dateOfBirth,
          },
          provider: {
            id: params.providerId,
          },
          trading_partner_id: 'generic_payer',
        }),
      });

      if (!response.ok) {
        throw new Error(`pVerify API error: ${response.statusText}`);
      }

      const data = await response.json();

      // Transform pVerify response to our format
      return this.transformPVerifyResponse(data);
    } catch (error) {
      console.error('pVerify API error:', error);

      // Return mock data if API is unavailable (for demo purposes)
      if (process.env.EXPO_PUBLIC_ENVIRONMENT === 'development') {
        return this.getMockInsuranceVerification(params.memberId);
      }

      return null;
    }
  }

  private static transformPVerifyResponse(pverifyData: any): InsuranceVerification {
    const eligibility = pverifyData.eligibility || {};
    const plan = eligibility.plan || {};
    const benefits = eligibility.benefits || {};

    return {
      memberId: eligibility.member?.id || '',
      isActive: eligibility.status === 'active',
      planDetails: {
        planName: plan.plan_name || 'Unknown Plan',
        planType: plan.plan_type || 'Unknown',
        effectiveDate: new Date(plan.effective_date || Date.now()),
        terminationDate: plan.termination_date ? new Date(plan.termination_date) : undefined,
      },
      benefits: {
        primaryCare: this.transformBenefit(benefits.primary_care),
        urgentCare: this.transformBenefit(benefits.urgent_care),
        emergency: this.transformBenefit(benefits.emergency),
        specialist: this.transformBenefit(benefits.specialist),
        prescription: this.transformBenefit(benefits.prescription),
        preventive: this.transformBenefit(benefits.preventive),
      },
      deductible: {
        individual: benefits.deductible?.individual || 0,
        family: benefits.deductible?.family || 0,
        met: benefits.deductible?.met || 0,
        remaining: benefits.deductible?.remaining || 0,
      },
      outOfPocketMax: {
        individual: benefits.out_of_pocket_max?.individual || 0,
        family: benefits.out_of_pocket_max?.family || 0,
        met: benefits.out_of_pocket_max?.met || 0,
        remaining: benefits.out_of_pocket_max?.remaining || 0,
      },
      verifiedAt: new Date(),
    };
  }

  private static transformBenefit(benefit: any): BenefitDetails {
    if (!benefit) {
      return {
        deductibleApplies: false,
        coverageLevel: 'not_covered',
      };
    }

    return {
      copay: benefit.copay || undefined,
      coinsurance: benefit.coinsurance || undefined,
      deductibleApplies: benefit.deductible_applies || false,
      coverageLevel: benefit.coverage_level || 'covered',
      notes: benefit.notes || undefined,
    };
  }

  // Utility method to clear cache
  static clearCache(): void {
    this.verificationCache.clear();
  }

  // Utility method to get cached verification
  static getCachedVerification(memberId: string, providerId: string): InsuranceVerification | null {
    const cacheKey = `${memberId}_${providerId}`;
    const cached = this.verificationCache.get(cacheKey);
    const now = Date.now();

    if (cached && (now - cached.timestamp) < APP_CONFIG.INSURANCE.VERIFICATION_CACHE_DURATION) {
      return cached.data;
    }

    return null;
  }
}
