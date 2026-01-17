const React = require('react');

const createHostComponent = (name) => name;

const View = createHostComponent('View');
const Text = createHostComponent('Text');
const TextInput = createHostComponent('TextInput');
const ScrollView = createHostComponent('ScrollView');
const FlatList = createHostComponent('FlatList');
const Image = createHostComponent('Image');
const Switch = createHostComponent('Switch');
const Modal = createHostComponent('Modal');
const Pressable = createHostComponent('Pressable');
const TouchableOpacity = createHostComponent('TouchableOpacity');
const ActivityIndicator = createHostComponent('ActivityIndicator');
const SafeAreaView = createHostComponent('SafeAreaView');
const KeyboardAvoidingView = createHostComponent('KeyboardAvoidingView');

const StyleSheet = {
  create: (styles) => styles,
  flatten: (style) => style,
  compose: (a, b) => [a, b],
  absoluteFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
};

const Platform = {
  OS: 'ios',
  select: (values) => (values ? values.ios || values.default : undefined),
};

const Dimensions = {
  get: () => ({ width: 390, height: 844, scale: 2, fontScale: 2 }),
};

const useWindowDimensions = () => Dimensions.get();

const Alert = {
  alert: jest.fn(),
};

const Linking = {
  openURL: jest.fn(),
  canOpenURL: jest.fn(async () => true),
};

const Animated = {
  View: createHostComponent('Animated.View'),
  Text: createHostComponent('Animated.Text'),
  createAnimatedComponent: (Component) => Component,
};

module.exports = {
  __esModule: true,
  default: {
    View,
    Text,
    TextInput,
    ScrollView,
    FlatList,
    Image,
    Switch,
    Modal,
    Pressable,
    TouchableOpacity,
    ActivityIndicator,
    SafeAreaView,
    KeyboardAvoidingView,
    StyleSheet,
    Platform,
    Dimensions,
    useWindowDimensions,
    Alert,
    Linking,
    Animated,
  },
  View,
  Text,
  TextInput,
  ScrollView,
  FlatList,
  Image,
  Switch,
  Modal,
  Pressable,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  KeyboardAvoidingView,
  StyleSheet,
  Platform,
  Dimensions,
  useWindowDimensions,
  Alert,
  Linking,
  Animated,
};
