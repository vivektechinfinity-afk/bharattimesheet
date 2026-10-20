/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Poppins is the geometric sans used across bharatenterprises.tech.
        sans: ['Poppins', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        // Sampled from bharatenterprises.tech
        dark: {
          900: '#0A0A0A', // near-black nav bar
          800: '#121212', // panels
          700: '#1C1C1C', // raised surfaces / inputs
          600: '#2A2A2A', // borders
          500: '#3A3A3A',
        },
        // Hero gradient — deep teal-navy
        deep: {
          900: '#062932',
          800: '#0B3A47',
          700: '#10505F',
        },
        accent: {
          gold: '#F2B733', // CTA button, social icons
          amber: '#E8A733',
          teal: '#4FE3C1', // hero chart line
          mint: '#7FF0D6',
        },
      },
      backgroundImage: {
        'gradient-gold': 'linear-gradient(135deg, #F2B733 0%, #E09B22 100%)',
        'gradient-teal': 'linear-gradient(135deg, #4FE3C1 0%, #2BB89A 100%)',
        'gradient-hero': 'linear-gradient(135deg, #0B3A47 0%, #062932 100%)',
        'gradient-brand': 'linear-gradient(135deg, #2F7FD4 0%, #8DD94A 50%, #F2B733 100%)',
      },
      boxShadow: {
        'glow-gold': '0 0 24px rgba(242, 183, 51, 0.28)',
        'glow-teal': '0 0 24px rgba(79, 227, 193, 0.25)',
      },
    },
  },
  plugins: [],
};
