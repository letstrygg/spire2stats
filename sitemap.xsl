<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="2.0" 
                xmlns:html="http://www.w3.org/TR/REC-html40"
                xmlns:sitemap="http://www.sitemaps.org/schemas/sitemap/0.9"
                xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="html" version="1.0" encoding="UTF-8" indent="yes"/>
  <xsl:template match="/">
    <html xmlns="http://www.w3.org/1999/xhtml">
      <head>
        <title>XML Sitemap | letstrygg</title>
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
        <style type="text/css">
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            font-size: 14px;
            color: #ccc;
            background-color: #121212;
            margin: 0;
            padding: 40px;
          }
          h1 { color: #0085e3; margin-top: 0; }
          p { color: #aaa; }
          a { color: #e67e22; text-decoration: none; }
          a:hover { text-decoration: underline; }
          
          table {
            border-collapse: collapse; 
            width: 100%; 
            margin-top: 20px;
            background-color: #1a1a1a; 
            border-radius: 8px; 
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0,0,0,0.3);
          }
          th { background-color: #333; color: #fff; text-align: left; padding: 12px 15px; }
          td { padding: 10px 15px; border-bottom: 1px solid #333; }
          tr:nth-child(even) td { background-color: #222; }
        </style>
      </head>
      <body>
        <div>
          <h1>letstrygg Sitemap</h1>
          <p>
            This is an XML Sitemap, formatted for human readability. It contains <span style="font-weight:bold; color:#2ecc71;"><xsl:value-of select="count(sitemap:urlset/sitemap:url)"/></span> URLs.
          </p>
          <table cellpadding="3">
            <thead>
              <tr>
                <th width="80%">URL</th>
                <th width="20%">Last Modified</th>
              </tr>
            </thead>
            <tbody>
              <xsl:for-each select="sitemap:urlset/sitemap:url">
                <xsl:sort select="sitemap:loc" data-type="text" order="ascending"/>
                <tr>
                  <td><a href="{sitemap:loc}" target="_blank"><xsl:value-of select="sitemap:loc"/></a></td>
                  <td><xsl:value-of select="substring(sitemap:lastmod,1,10)"/></td>
                </tr>
              </xsl:for-each>
            </tbody>
          </table>
        </div>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>