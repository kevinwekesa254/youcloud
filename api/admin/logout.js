const cms = require("../_lib/cms");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Set-Cookie", cms.clearCookie());
  return res.status(200).json({ signedIn: false });
};
