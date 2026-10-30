const cms = require("./_lib/cms");

// Public: the page edits from /admin → Pages, read by /site-content.js on every
// page load. Cached briefly at the edge so a save goes live within about a minute.
module.exports = async (req, res) => {
  try {
    const content = await cms.getPublicSiteContent();
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=30, stale-while-revalidate=300");
    return res.status(200).json({ pages: content.pages || {} });
  } catch (e) {
    console.error(e);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ pages: {} });
  }
};
