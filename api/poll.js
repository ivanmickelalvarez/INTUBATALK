const handler = require("./index");
module.exports = (req, res) => {
  req.url = "/api/poll" + (req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "");
  return handler(req, res);
};

