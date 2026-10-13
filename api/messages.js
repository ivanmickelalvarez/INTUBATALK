const handler = require("./index");
module.exports = (req, res) => {
  req.url = "/api/messages" + (req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "");
  return handler(req, res);
};

