module.exports = {
  content: [
    './views/**/*.ejs',
    './public/**/*.html',
    './prive/**/*.html',
    './routes/**/*.js',
    './src/**/*.css'
  ],
  darkMode: ['selector', '[data-theme="dark"]'],
  corePlugins: {
    preflight: true
  },
  theme: {
    extend: {
      colors: {
        ajj: {
          emerald: '#087f5b',
          deep: '#062c2a',
          gold: '#d8aa55',
          sand: '#e9d7b4'
        },
        femme: {
          pink: '#db2777',
          violet: '#7c3aed'
        }
      },
      fontFamily: {
        Cairo: ['Cairo', 'sans-serif'],
        Inter: ['Inter', 'sans-serif']
      }
    }
  },
  plugins: []
};
