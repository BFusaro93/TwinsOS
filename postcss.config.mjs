/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    tailwindcss: {},
    // After Tailwind so it also converts the arbitrary px values it generates.
    "./postcss-px-to-rem.cjs": {},
    autoprefixer: {},
  },
};

export default config;
