/* ============================================================
   xlsx.js – Minimaler XLSX-Writer ohne externe Bibliotheken
   ------------------------------------------------------------
   Erzeugt eine gültige .xlsx-Datei (Office Open XML) als Blob.
   Die ZIP-Container werden ohne Kompression ("stored") geschrieben,
   das ist für Tabellen dieser Größe völlig ausreichend und kommt
   ohne Deflate-Implementierung aus. Texte werden als inlineStr
   abgelegt – dadurch ist keine sharedStrings-Tabelle nötig und die
   Datei bleibt in Excel/LibreOffice frei bearbeitbar.

   Verwendung:
     XlsxWriter.build([
       { name: 'Blattname', columns: [{width:14}, ...],
         freeze: 1, autoFilter: true,
         rows: [ [ {v:'Text', s:'header'}, {v:12, t:'n'} ], ... ] }
     ]) -> Blob

   Zellformate (s): 'default' | 'header' | 'title' | 'bold' | 'muted'
                    'cell' | 'wrap' | 'bad' | 'warn' | 'good' | 'time'
   ============================================================ */

window.XlsxWriter = (function () {
  'use strict';

  /* ---------------- ZIP ---------------- */

  var CRC_TABLE = (function () {
    var table = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) {
      c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function utf8(str) { return new TextEncoder().encode(str); }

  function dosDateTime(date) {
    var d = date || new Date();
    var year = Math.max(1980, d.getFullYear());
    return {
      time: ((d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2))) & 0xFFFF,
      date: (((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF
    };
  }

  /** files: [{ name, data: Uint8Array }] -> Blob (ZIP, gespeichert) */
  function zip(files) {
    var stamp = dosDateTime(new Date());
    var chunks = [];
    var central = [];
    var offset = 0;

    files.forEach(function (file) {
      var nameBytes = utf8(file.name);
      var crc = crc32(file.data);
      var size = file.data.length;

      var local = new Uint8Array(30 + nameBytes.length);
      var lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);   // Signatur
      lv.setUint16(4, 20, true);           // benötigte Version
      lv.setUint16(6, 0x0800, true);       // Flags: UTF-8 Dateinamen
      lv.setUint16(8, 0, true);            // Methode: stored
      lv.setUint16(10, stamp.time, true);
      lv.setUint16(12, stamp.date, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, size, true);
      lv.setUint32(22, size, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);
      local.set(nameBytes, 30);

      chunks.push(local, file.data);

      var entry = new Uint8Array(46 + nameBytes.length);
      var cv = new DataView(entry.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);           // erzeugt von Version
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, stamp.time, true);
      cv.setUint16(14, stamp.date, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, size, true);
      cv.setUint32(24, size, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint32(42, offset, true);
      entry.set(nameBytes, 46);
      central.push(entry);

      offset += local.length + size;
    });

    var centralSize = central.reduce(function (n, e) { return n + e.length; }, 0);
    var end = new Uint8Array(22);
    var ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);

    return new Blob(chunks.concat(central, [end]),
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  /* ---------------- XML-Hilfen ---------------- */

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      // Steuerzeichen sind in XML nicht erlaubt
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  }

  function colName(index) {
    var n = index + 1, s = '';
    while (n > 0) {
      var rest = (n - 1) % 26;
      s = String.fromCharCode(65 + rest) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  /* Reihenfolge muss zu cellXfs in styles.xml passen */
  var STYLE_INDEX = {
    default: 0,
    title: 1,
    header: 2,
    cell: 3,
    wrap: 4,
    bold: 5,
    muted: 6,
    bad: 7,
    warn: 8,
    good: 9,
    time: 10,
    number: 11
  };

  function styleId(name) {
    return STYLE_INDEX[name] != null ? STYLE_INDEX[name] : 0;
  }

  function stylesXml() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<numFmts count="1"><numFmt numFmtId="164" formatCode="0.00"/></numFmts>' +
      '<fonts count="5">' +
        '<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
        '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
        '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>' +
        '<font><b/><sz val="14"/><name val="Calibri"/><family val="2"/></font>' +
        '<font><i/><sz val="10"/><color rgb="FF666666"/><name val="Calibri"/><family val="2"/></font>' +
      '</fonts>' +
      '<fills count="6">' +
        '<fill><patternFill patternType="none"/></fill>' +
        '<fill><patternFill patternType="gray125"/></fill>' +
        '<fill><patternFill patternType="solid"><fgColor rgb="FF2F4F9E"/><bgColor indexed="64"/></patternFill></fill>' +
        '<fill><patternFill patternType="solid"><fgColor rgb="FFFBD8D3"/><bgColor indexed="64"/></patternFill></fill>' +
        '<fill><patternFill patternType="solid"><fgColor rgb="FFFDEFD3"/><bgColor indexed="64"/></patternFill></fill>' +
        '<fill><patternFill patternType="solid"><fgColor rgb="FFDFF3E5"/><bgColor indexed="64"/></patternFill></fill>' +
      '</fills>' +
      '<borders count="2">' +
        '<border><left/><right/><top/><bottom/><diagonal/></border>' +
        '<border>' +
          '<left style="thin"><color rgb="FFD0D5E0"/></left>' +
          '<right style="thin"><color rgb="FFD0D5E0"/></right>' +
          '<top style="thin"><color rgb="FFD0D5E0"/></top>' +
          '<bottom style="thin"><color rgb="FFD0D5E0"/></bottom>' +
          '<diagonal/>' +
        '</border>' +
      '</borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="12">' +
        // 0 default
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
        // 1 title
        '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
        // 2 header
        '<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>' +
        // 3 cell
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
        // 4 wrap
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
        // 5 bold
        '<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
        // 6 muted
        '<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
        // 7 bad
        '<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
        // 8 warn
        '<xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
        // 9 good
        '<xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
        // 10 time (linksbündig, als Text bearbeitbar)
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>' +
        // 11 number
        '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' +
      '</cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Standard" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>';
  }

  /**
   * Eine Zelle beschreiben:
   *   String / Zahl direkt, oder { v, t:'s'|'n', s:'header' }
   */
  function cellXml(cell, ref) {
    var value, type, style;
    if (cell == null) return '';
    if (typeof cell === 'object') {
      value = cell.v;
      type = cell.t || (typeof value === 'number' ? 'n' : 's');
      style = styleId(cell.s || 'cell');
    } else {
      value = cell;
      type = typeof cell === 'number' ? 'n' : 's';
      style = styleId('cell');
    }
    if (value == null || value === '') {
      return '<c r="' + ref + '" s="' + style + '"/>';
    }
    if (type === 'n' && typeof value === 'number' && isFinite(value)) {
      return '<c r="' + ref + '" s="' + style + '"><v>' + value + '</v></c>';
    }
    return '<c r="' + ref + '" s="' + style + '" t="inlineStr"><is><t xml:space="preserve">' +
      esc(value) + '</t></is></c>';
  }

  function sheetXml(sheet) {
    var rows = sheet.rows || [];
    var maxCols = 0;
    rows.forEach(function (r) { maxCols = Math.max(maxCols, (r || []).length); });
    maxCols = Math.max(maxCols, (sheet.columns || []).length, 1);

    var xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';

    xml += '<dimension ref="A1:' + colName(maxCols - 1) + Math.max(1, rows.length) + '"/>';

    xml += '<sheetViews><sheetView workbookViewId="0">';
    if (sheet.freeze) {
      xml += '<pane ySplit="' + sheet.freeze + '" topLeftCell="A' + (sheet.freeze + 1) +
        '" activePane="bottomLeft" state="frozen"/>' +
        '<selection pane="bottomLeft" activeCell="A' + (sheet.freeze + 1) + '" sqref="A' + (sheet.freeze + 1) + '"/>';
    }
    xml += '</sheetView></sheetViews>';
    xml += '<sheetFormatPr defaultRowHeight="15"/>';

    if (sheet.columns && sheet.columns.length) {
      xml += '<cols>';
      sheet.columns.forEach(function (col, i) {
        xml += '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' +
          (col.width || 14) + '" customWidth="1"/>';
      });
      xml += '</cols>';
    }

    xml += '<sheetData>';
    rows.forEach(function (row, rIdx) {
      if (!row) { return; }
      xml += '<row r="' + (rIdx + 1) + '"' + (sheet.headerRow === rIdx + 1 ? ' ht="22" customHeight="1"' : '') + '>';
      row.forEach(function (cell, cIdx) {
        xml += cellXml(cell, colName(cIdx) + (rIdx + 1));
      });
      xml += '</row>';
    });
    xml += '</sheetData>';

    if (sheet.autoFilter && rows.length > (sheet.autoFilterRow || 1)) {
      var fRow = sheet.autoFilterRow || 1;
      xml += '<autoFilter ref="A' + fRow + ':' + colName(maxCols - 1) + rows.length + '"/>';
    }

    xml += '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>';
    xml += '</worksheet>';
    return xml;
  }

  /** Blattnamen für Excel entschärfen (max. 31 Zeichen, keine Sonderzeichen) */
  function safeSheetName(name, index) {
    var clean = String(name || ('Blatt' + (index + 1))).replace(/[\\\/\?\*\[\]:]/g, ' ').trim();
    if (!clean) clean = 'Blatt' + (index + 1);
    return clean.slice(0, 31);
  }

  /** sheets -> Blob */
  function build(sheets) {
    var names = sheets.map(function (s, i) { return safeSheetName(s.name, i); });

    var contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      sheets.map(function (s, i) {
        return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ' +
          'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
      }).join('') +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
      '</Types>';

    var rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
      '</Relationships>';

    var workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets>' +
      names.map(function (n, i) {
        return '<sheet name="' + esc(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
      }).join('') +
      '</sheets></workbook>';

    var workbookRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map(function (s, i) {
        return '<Relationship Id="rId' + (i + 1) + '" ' +
          'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" ' +
          'Target="worksheets/sheet' + (i + 1) + '.xml"/>';
      }).join('') +
      '<Relationship Id="rId' + (sheets.length + 1) + '" ' +
      'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>';

    var now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    var core = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
      'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      '<dc:creator>Schichtplaner</dc:creator><cp:lastModifiedBy>Schichtplaner</cp:lastModifiedBy>' +
      '<dcterms:created xsi:type="dcterms:W3CDTF">' + now + '</dcterms:created>' +
      '<dcterms:modified xsi:type="dcterms:W3CDTF">' + now + '</dcterms:modified>' +
      '</cp:coreProperties>';

    var app = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ' +
      'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
      '<Application>Schichtplaner</Application></Properties>';

    var files = [
      { name: '[Content_Types].xml', data: utf8(contentTypes) },
      { name: '_rels/.rels', data: utf8(rootRels) },
      { name: 'docProps/core.xml', data: utf8(core) },
      { name: 'docProps/app.xml', data: utf8(app) },
      { name: 'xl/workbook.xml', data: utf8(workbook) },
      { name: 'xl/_rels/workbook.xml.rels', data: utf8(workbookRels) },
      { name: 'xl/styles.xml', data: utf8(stylesXml()) }
    ];
    sheets.forEach(function (sheet, i) {
      files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: utf8(sheetXml(sheet)) });
    });

    return zip(files);
  }

  return { build: build, colName: colName, zip: zip, crc32: crc32 };
})();
