/* ==========================================================================
   OFFLINE EXPORT ENGINE
   A minimal ZIP writer (STORE method) plus OOXML builders, so that Word and
   Excel files are produced entirely in the browser with no libraries and no
   internet connection.
   ========================================================================== */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[i] = c >>> 0; }
  return t;
})();
function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

function zipBuild(files) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  const u16 = n => [n & 0xFF, (n >>> 8) & 0xFF];
  const u32 = n => [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF];
  files.forEach(f => {
    const nameB = enc.encode(f.name);
    const dataB = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(dataB);
    const local = [].concat([0x50, 0x4B, 0x03, 0x04], u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(dataB.length), u32(dataB.length), u16(nameB.length), u16(0));
    parts.push(new Uint8Array(local), nameB, dataB);
    const cen = [].concat([0x50, 0x4B, 0x01, 0x02], u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(dataB.length), u32(dataB.length), u16(nameB.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset));
    central.push(new Uint8Array(cen), nameB);
    offset += local.length + nameB.length + dataB.length;
  });
  let cenLen = 0; central.forEach(p => cenLen += p.length);
  const end = new Uint8Array([].concat([0x50, 0x4B, 0x05, 0x06], u16(0), u16(0),
    u16(files.length), u16(files.length), u32(cenLen), u32(offset), u16(0)));
  let total = offset + cenLen + end.length;
  const out = new Uint8Array(total); let p = 0;
  parts.concat(central, [end]).forEach(b => { out.set(b, p); p += b.length; });
  return new Blob([out], { type: 'application/zip' });
}

const xesc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
  // strip characters illegal in XML 1.0
  .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

/* -------------------------------- WORD ---------------------------------- */
const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

function wRun(text, o) {
  o = o || {};
  const rpr = ['<w:rPr>',
    o.b ? '<w:b/>' : '', o.i ? '<w:i/>' : '', o.u ? '<w:u w:val="single"/>' : '',
    o.size ? `<w:sz w:val="${o.size * 2}"/><w:szCs w:val="${o.size * 2}"/>` : '',
    o.color ? `<w:color w:val="${o.color}"/>` : '',
    o.caps ? '<w:caps/>' : '', '</w:rPr>'].join('');
  const lines = String(text == null ? '' : text).split('\n');
  return lines.map((ln, i) =>
    `<w:r>${rpr}${i ? '<w:br/>' : ''}<w:t xml:space="preserve">${xesc(ln)}</w:t></w:r>`).join('');
}
function wPara(text, o) {
  o = o || {};
  const ppr = ['<w:pPr>',
    o.style ? `<w:pStyle w:val="${o.style}"/>` : '',
    o.align ? `<w:jc w:val="${o.align}"/>` : '',
    o.spaceAfter != null ? `<w:spacing w:after="${o.spaceAfter}"/>` : '<w:spacing w:after="120"/>',
    o.indent ? `<w:ind w:left="${o.indent}" w:hanging="${o.hanging || 0}"/>` : '',
    o.keepNext ? '<w:keepNext/>' : '',
    o.pageBreakBefore ? '<w:pageBreakBefore/>' : '',
    '</w:pPr>'].join('');
  return `<w:p>${ppr}${text === '' ? '' : wRun(text, o)}</w:p>`;
}
function wCell(text, o) {
  o = o || {};
  const shade = o.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.fill}"/>` : '';
  const width = o.w ? `<w:tcW w:w="${o.w}" w:type="dxa"/>` : '';
  const span = o.span ? `<w:gridSpan w:val="${o.span}"/>` : '';
  const body = Array.isArray(text)
    ? text.map(t => wPara(t, o)).join('')
    : wPara(text, o);
  return `<w:tc><w:tcPr>${width}${span}${shade}<w:vAlign w:val="top"/></w:tcPr>${body}</w:tc>`;
}
function wTable(rows, widths, opt) {
  opt = opt || {};
  const bd = sz => `<w:tblBorders>${['top','left','bottom','right','insideH','insideV']
    .map(s => `<w:${s} w:val="single" w:sz="${sz}" w:space="0" w:color="808080"/>`).join('')}</w:tblBorders>`;
  const grid = `<w:tblGrid>${widths.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
  const body = rows.map((r, ri) => {
    const isHead = ri === 0 && opt.header !== false;
    const cells = r.map((c, ci) => {
      const cell = (c && typeof c === 'object' && !Array.isArray(c)) ? c : { text: c };
      return wCell(cell.text, {
        w: widths[ci], b: isHead || cell.b, size: opt.size || 9,
        fill: isHead ? (opt.headFill || 'D9D9D9') : cell.fill,
        span: cell.span, align: cell.align, spaceAfter: 40
      });
    }).join('');
    return `<w:tr>${isHead ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${cells}</w:tr>`;
  }).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="${opt.total || 9360}" w:type="dxa"/>${bd(4)}<w:tblLayout w:type="fixed"/></w:tblPr>${grid}${body}</w:tbl>` + wPara('', { spaceAfter: 80 });
}

function docxBuild(bodyXml, opt) {
  opt = opt || {};
  const land = opt.landscape;
  const sect = `<w:sectPr>
    <w:pgSz w:w="${land ? 16838 : 11906}" w:h="${land ? 11906 : 16838}"${land ? ' w:orient="landscape"' : ''}/>
    <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1418" w:header="708" w:footer="708" w:gutter="0"/>
    <w:footerReference w:type="default" r:id="rId5"/></w:sectPr>`;
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W_NS} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${bodyXml}${sect}</w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W_NS}>
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="100"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>
</w:styles>`;
  const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr ${W_NS}><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">${xesc(opt.footer || '')} | Page </w:t></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText>PAGE</w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`;
  return zipBuild([
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>` },
    { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>` },
    { name: 'word/_rels/document.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>` },
    { name: 'word/document.xml', data: doc },
    { name: 'word/styles.xml', data: styles },
    { name: 'word/footer1.xml', data: footer }
  ]);
}

/* -------------------------------- EXCEL --------------------------------- */
function colName(n) { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; } return s; }

function xlsxBuild(sheets) {
  // sheets: [{name, rows:[[cell,...]], widths:[n], freeze:1}]
  const sheetXml = sheets.map(sh => {
    const cols = sh.widths ? `<cols>${sh.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
    const rows = sh.rows.map((r, ri) => {
      const cells = r.map((c, ci) => {
        const cell = (c && typeof c === 'object') ? c : { v: c };
        const ref = colName(ci) + (ri + 1);
        const styleIdx = cell.s != null ? cell.s : (ri === 0 ? 1 : 0);
        if (cell.v == null || cell.v === '') return `<c r="${ref}" s="${styleIdx}"/>`;
        if (typeof cell.v === 'number' && isFinite(cell.v))
          return `<c r="${ref}" s="${styleIdx}"><v>${cell.v}</v></c>`;
        return `<c r="${ref}" s="${styleIdx}" t="inlineStr"><is><t xml:space="preserve">${xesc(cell.v)}</t></is></c>`;
      }).join('');
      return `<row r="${ri + 1}"${ri === 0 ? ' ht="30" customHeight="1"' : ''}>${cells}</row>`;
    }).join('');
    const pane = sh.freeze ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sh.freeze}" topLeftCell="A${sh.freeze + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : '';
    const auto = sh.rows.length > 1 ? `<autoFilter ref="A1:${colName(sh.rows[0].length - 1)}${sh.rows.length}"/>` : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${pane}${cols}<sheetData>${rows}</sheetData>${auto}</worksheet>`;
  });
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="4"><font><sz val="10"/><name val="Calibri"/></font>
<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="10"/><name val="Calibri"/></font>
<font><sz val="10"/><color rgb="FFB00020"/><name val="Calibri"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF1F3864"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5">
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const files = [
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>` },
    { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheets.map((s, i) => `<sheet name="${xesc(s.name.substring(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}
<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', data: styles }
  ];
  sheets.forEach((s, i) => files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml[i] }));
  return zipBuild(files);
}

function saveBlob(blob, filename) {
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
}
function saveText(text, filename, mime) {
  saveBlob(new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' }), filename);
}
