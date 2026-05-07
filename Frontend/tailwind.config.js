/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // VSYK Brand Colors — extracted from design HTML references
        primary: '#01789E',          // Deep Navy Blue
        'primary-container': '#01789E',
        secondary: '#10D7CD',        // Vibrant Teal Accent
        'secondary-container': '#10D7CD',
        background: '#F8FAFC',       // Soft Off-White
        surface: '#FFFFFF',          // Pure White cards
        'on-surface': '#0b1c30',
        'on-surface-variant': '#3f484e',
        'on-background': '#0b1c30',
        'on-primary': '#ffffff',
        'on-primary-container': '#ffffff',
        'on-secondary': '#ffffff',
        outline: '#6f787e',
        'outline-variant': '#bec8ce',
        error: '#ba1a1a',
        'error-container': '#ffdad6',
        'on-error-container': '#93000a',
        'surface-container': '#F1F5F9',
        'surface-container-low': '#F1F5F9',
        'surface-container-high': '#E2E8F0',
        'surface-container-lowest': '#FFFFFF',
        'primary-fixed': '#c1e8ff',
        'primary-fixed-dim': '#7cd1fb',
        'inverse-surface': '#213145',
        'inverse-on-surface': '#eaf1ff',
      },
      fontFamily: {
        'space-grotesk': ['SpaceGrotesk'],
        'inter': ['Inter'],
        'hind-madurai': ['HindMadurai'],
      },
      spacing: {
        xs: '4px',
        sm: '8px',
        md: '16px',
        lg: '24px',
        xl: '32px',
        xxl: '48px',
        'container-padding': '20px',
        gutter: '16px',
      },
      borderRadius: {
        DEFAULT: '4px',
        lg: '8px',
        xl: '12px',
        '2xl': '16px',
        '3xl': '20px',
        '4xl': '24px',
        full: '9999px',
      },
    },
  },
  plugins: [],
};
