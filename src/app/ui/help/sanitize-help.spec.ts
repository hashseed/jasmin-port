import { sanitizeHelpHtml } from './sanitize-help';

/** An upstream page (help/en/MOV.htm, shortened). */
const MOV_PAGE = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en">
<head>
    <title>MOV.htm</title>
</head>
<body>
<div style="font-family:Helvetica,Arial,sans-serif;font-size:11px;">
    <strong>Command:</strong> MOV-Move<br>
    <strong>Usage:</strong> MOV DEST,SRC<br>
</div>
</body>
</html>`;

describe('sanitizeHelpHtml', () => {
  it('keeps the text and basic markup of a page, without its title and styles', () => {
    const html = sanitizeHelpHtml(MOV_PAGE);
    expect(html).toContain('<strong>Command:</strong> MOV-Move<br>');
    expect(html).toContain('<div>');
    expect(html).not.toContain('style');
    expect(html).not.toContain('MOV.htm');
    expect(html).not.toContain('DOCTYPE');
  });

  it('drops scripts, styles, embedded content and event handlers', () => {
    const html = sanitizeHelpHtml(
      `<p onclick="alert(1)" class="x">a<script>alert(2)</script>b</p>` +
        `<style>p{}</style><iframe src="x"></iframe><img src="x" onerror="alert(3)">` +
        `<svg><script>alert(4)</script></svg><object data="x"></object>` +
        `<template><b>t</b></template><form><input></form><!-- note -->c`,
    );
    expect(html).toBe('<p>ab</p>c');
  });

  it('unwraps unknown elements but keeps their content', () => {
    expect(sanitizeHelpHtml('<font color="red"><center>x <b>y</b></center></font>')).toBe(
      'x <b>y</b>',
    );
  });

  it('keeps links to help pages and turns every other link into text', () => {
    expect(sanitizeHelpHtml('<a href="add.htm" target="_top" onclick="x()">ADD</a>')).toBe(
      '<a href="ADD.htm">ADD</a>',
    );
    expect(
      sanitizeHelpHtml(
        '<a href="javascript:alert(1)">a</a><a href="https://x.org/ADD.htm">b</a><a name="c">c</a>',
      ),
    ).toBe('abc');
  });

  it('escapes text', () => {
    expect(sanitizeHelpHtml('<p>a &lt;script&gt; &amp; b</p>')).toBe(
      '<p>a &lt;script&gt; &amp; b</p>',
    );
  });
});
