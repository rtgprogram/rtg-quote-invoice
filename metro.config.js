const { getDefaultConfig } = require('@expo/metro-config');

const defaultConfig = getDefaultConfig(__dirname);

module.exports = {
  ...defaultConfig,
  server: {
    enhanceMiddleware: (middleware) => {
      return (req, res, next) => {
        // Fuerza a exponer tu IP en lugar de localhost
        if (req.headers.host.includes('127.0.0.1')) {
          req.headers.host = '192.168.68.92:8081';
        }
        return middleware(req, res, next);
      };
    },
  },
};
