/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        tesco: {
          blue: '#00539f',
          red: '#ee1c2e',
          light: '#e6f0fa',
        },
        asda: {
          green: '#78be20',
          dark: '#006a4e',
          light: '#f0f9eb',
        },
        sainsburys: {
          orange: '#e05a00',
          dark: '#b34700',
          light: '#fff3eb',
        },
        morrisons: {
          yellow: '#ffcc00',
          green: '#004c3f',
          light: '#f5f9f8',
        },
        iceland: {
          red: '#d01025',
          dark: '#9d0012',
          light: '#fdedef',
        },
      },
    },
  },
  plugins: [],
}
