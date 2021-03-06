const mdIt = require('markdown-it');
const {IdentifiableValue, RefValue, ChoiceValue, TBD, ValueSetConstraint, CodeConstraint, TypeConstraint, BooleanConstraint} = require('shr-models');

function exportToMarkdown(specifications) {
  const exporter = new MarkdownExporter(specifications);
  return exporter.export();
}

function exportToHTML(specifications) {
  const md2html = new mdIt({ html: true });
  const md = exportToMarkdown(specifications);
  const indexHTML = embedInHTMLPage('Standard Health Record', md2html.render(md.index));
  const entryIndexHTML = embedInHTMLPage('Standard Health Record Entries', md2html.render(md.entryIndex));
  const namespaceHTMLs = {};
  for (const ns of Object.keys(md.namespaces)) {
    const namespaceHTML = embedInHTMLPage(`SHR: ${nsTitle(ns)}`, md2html.render(md.namespaces[ns].index), ns);
    const definitionHTMLs = {};
    for (const def of Object.keys(md.namespaces[ns].definitions)) {
      definitionHTMLs[def] = embedInHTMLPage(def, md2html.render(md.namespaces[ns].definitions[def]), ns);
    }
    namespaceHTMLs[ns] = {
      index: namespaceHTML,
      definitions: definitionHTMLs
    };
  }
  return {
    index: indexHTML,
    entryIndex: entryIndexHTML,
    namespaces: namespaceHTMLs
  };
}

function embedInHTMLPage(title, body, namespace) {
  // First replace all links to .md to be links to .html
  body = body.replace(/\.md#/g, '.html#');
  // Then figure out the relative path to the css
  let pathToBase = '';
  if (namespace) {
    const depth = namespace.split('.').length;
    for (let i=0; i < depth; i++) {
      pathToBase += '../';
    }
  }
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${title}</title>
  <link rel="stylesheet" href="${pathToBase}shr-github-markdown.css">
  <link rel="stylesheet" type="text/css" href="https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/css/bootstrap.min.css">
  <style>
      thead, th {display: none;}
      .markdown-body {
          box-sizing: border-box;
          min-width: 200px;
          max-width: 980px;
          margin: 0 auto;
          padding: 45px;
      }
  </style>
</head>
<body class="markdown-body">
${body}
</body>
</html>`;
}

class IndexManager {
  constructor() {
    this.index = '# Standard Health Record\n';
    this.entryIndex = '# Standard Health Record\n';
  }

  appendIndex(content) {
    this.index += content;
  }

  appendEntryIndex(content) {
    this.entryIndex += content;
  }

  append(content, includingEntryIndex=true) {
    this.appendIndex(content);
    if (includingEntryIndex) {
      this.appendEntryIndex(content);
    }
  }
}

class MarkdownExporter {
  constructor(specifications) {
    this._specs = specifications;
    this._currentNamespace = '';
  }

  export() {
    const idxMgr = new IndexManager();
    const namespaceMDs = {};
    for (const ns of this._specs.namespaces.all) {
      this._currentNamespace = ns;
      let nsMD = `# ${nsTitle(ns.namespace)}`;

      // Don't show empty namespaces in the index
      const counts = definitionCounts(this._specs.dataElements.byNamespace(ns.namespace));
      if (counts.elementCount == 0) {
        idxMgr.append('\n<!---');
      } else if (counts.entryCount == 0) {
        idxMgr.appendEntryIndex('\n<!---');
      }
      const elPerColumn = Math.ceil(counts.elementCount / 3);
      const enPerColumn = Math.ceil(counts.entryCount / 3);

      idxMgr.append('\n<div class="row">\n');
      idxMgr.append(`\n## [${nsTitle(ns.namespace)}](${toURLRelativeToBase(ns.namespace)})\n`);
      const defMDs = {};
      let defs = this._specs.dataElements.byNamespace(ns.namespace)
        .sort(function(l,r) {return l.identifier.name.localeCompare(r.identifier.name);});
      let elCount = 0, enCount = 0;
      for (const def of defs) {
        defMDs[def.identifier.name] = this.defToMarkdown(def);
        nsMD += `\n\n${defMDs[def.identifier.name]}`.replace(/\(index\.md#/g, '(#'); // fix index.md#Foo to be #Foo
        if (elCount % elPerColumn == 0) {
          if (elCount > 0) {
            idxMgr.appendIndex('\n</div>\n');
          }
          idxMgr.appendIndex('\n<div class="col-md-4">\n\n');
        }
        elCount++;
        if (def.isEntry) {
          if (enCount % enPerColumn == 0) {
            if (enCount > 0) {
              idxMgr.appendEntryIndex('\n</div>\n');
            }
            idxMgr.appendEntryIndex('\n<div class="col-md-4">\n\n');
          }
          enCount++;
        }
        idxMgr.append(`- [${def.identifier.name}](${toURLRelativeToBase(ns.namespace, def.identifier.name)})\n`, def.isEntry);
      }
      if (elCount > 0) {
        idxMgr.appendIndex('\n</div>\n');
      }
      if (enCount > 0) {
        idxMgr.appendEntryIndex('\n</div>\n');
      }
      idxMgr.append('\n</div>\n');

      // Don't show empty namespaces in the index
      if (counts.elementCount == 0) {
        idxMgr.append('\n-->\n');
      } else if (counts.entryCount == 0) {
        idxMgr.appendEntryIndex('\n-->\n');
      }

      namespaceMDs[ns.namespace] = {
        index: nsMD,
        definitions: defMDs
      };
    }
    return {
      index: idxMgr.index,
      entryIndex: idxMgr.entryIndex,
      namespaces: namespaceMDs
    };
  }

  defToMarkdown(def) {
    let name = def.identifier.name;
    if (def.isEntry) {
      name += ' [Entry]';
    }
    let md = `### <a name="${def.identifier.name}"></a>${name}\n`;
    if (typeof def.description != 'undefined') {
      md += `${def.description}`;
    }

    if (def.concepts.length > 0) {
      for (const concept of def.concepts) {
        md += ` ${conceptMD(concept)},`;
      }
      md = md.slice(0, -1);
    }
    md += `\n\n`;

    // Create the table heading
    md += tr();
    md += tr('---','---','---');
    // Create the table of values
    for (const base of def.basedOn) {
      md += tr(`Based&nbsp;On:&nbsp;${this.identifierMD(new IdentifiableValue(base))}`, '', this.identifierDescription(base));
    }
    if (def.value) {
      if (def.value instanceof ChoiceValue) {
        md += this.choiceTr(def.value, 0, true);
      } else {
        const card = cardinalityMD(def.value);
        md += tr(`Value:&nbsp;${this.valueMD(def.value)}`, card != '1' ? card : '', this.valueDescription(def.value));
        md += this.childConstraintRows(def.value);
      }
    }
    for (const field of def.fields) {
      if (field instanceof ChoiceValue) {
        md += this.choiceTr(field);
      } else {
        md += tr(this.valueMD(field), cardinalityMD(field), this.valueDescription(field));
        md += this.childConstraintRows(field);
      }
    }
    return md.slice(0, -1); // removes trailing newline
  }

  choiceTr(choice, indent=0, isValue=false) {
    const text = isValue ? 'Value:&nbsp;Choice' : 'Choice';
    const card = cardinalityMD(choice);
    let md = tr(indentIt(text, indent), (isValue && card == '1') ? '' : card);
    for (let option of choice.options) {
      if (option instanceof ChoiceValue) {
        md += this.choiceTr(option, indent+1);
      } else {
        md += tr(indentIt(this.valueMD(option), indent+1), cardinalityMD(option), this.valueDescription(option));
      }
    }
    return md;
  }

  childConstraintRows(value) {
    // First group them by paths since we want to put each path in a row
    const pathMap = {};
    for (const constraint of value.constraintsFilter.child.constraints) {
      const pathStr = constraint.path.map(p => p.toString()).join(':');
      if (!pathMap.hasOwnProperty(pathStr)) {
        pathMap[pathStr] = [];
      }
      pathMap[pathStr].push(constraint);
    }
    let rows = '';
    // Then process each path at a time
    for (const p of Object.keys(pathMap)) {
      // For ease of processing (and re-use) build up a value with these constraints as its own
      const constraints = pathMap[p];
      const path = constraints[0].path;
      const lastId = path[path.length-1];
      const tempVal = new IdentifiableValue(lastId);
      for (const constraint of constraints) {
        const c = constraint.clone();
        c.path.length = 0;
        tempVal.addConstraint(c);
      }
      const card = cardinalityMD(tempVal);
      const pathMD = [...(path.slice(0, -1).map(id => this.identifierMD(new IdentifiableValue(id)))), this.valueMD(tempVal)].join('.');
      rows += tr(`&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;with ${pathMD}`, card != '?' ? card : '', this.valueDescription(tempVal));
    }
    return rows;
  }

  valueDescription(value) {
    if (value instanceof TBD) {
      return ''; // TBD
    } else if (value instanceof IdentifiableValue && value.identifier.isPrimitive) {
      return '';
    } else if (value instanceof ChoiceValue) {
      // Still *can* happen when a choice is nested in a choice
      return this.inlineChoice(value);
    }
    const typeConstraint = value.constraintsFilter.own.type.single;
    if (typeConstraint) {
      const desc = this.identifierDescription(typeConstraint.isA);
      if (desc != '') {
        return desc;
      } // else fall back to base description
    }
    return this.identifierDescription(value.identifier);
  }

  identifierDescription(identifier) {
    const def = this._specs.dataElements.findByIdentifier(identifier);
    if (def && def.description) {
      return def.description;
    }
    return '';
  }

  valueMD(value) {
    var md;
    if (value instanceof TBD) {
      if (value.text && value.text.length > 0) {
        md = `\`${value.text}\` _(TBD)_`;
      } else {
        md = '_(TBD)_';
      }
    } else if (value instanceof ChoiceValue) {
      md =  this.inlineChoice(value); //
    } else if (value instanceof RefValue) {
      md =  `reference to ${this.identifierMD(value)}`;
    } else if (value instanceof IdentifiableValue) {
      md = this.identifierMD(value);
    }

    for (const constraint of value.constraintsFilter.own.constraints) {
      if (constraint instanceof ValueSetConstraint) {
        md += ` from ${constraint.valueSet}`;
      } else if (constraint instanceof CodeConstraint) {
        md += ` is ${conceptMD(constraint.code)}`;
      } else if (constraint instanceof TypeConstraint) {
        md += ` is ${this.identifierMD(new IdentifiableValue(constraint.isA))}`;
      } else if (constraint instanceof BooleanConstraint) {
        md += ` is \`${constraint.value}\``;
      }
    }

    const icConstraints = value.constraintsFilter.own.includesCode.constraints;
    if (icConstraints.length > 0) {
      md += ` includes ` + icConstraints.map(cst => conceptMD(cst.code)).join(' and ');
    }

    return md;
  }

  inlineChoice(value) {
    let md = `Choice of: <ul>`;
    for (const option of value.options) {
      const quantifier = cardinalityMD(option);
      md += `<li>${quantifier == '1'? '' : quantifier + ' '}${this.valueMD(option)}</li>`;
    }
    return md + '</ul>';
  }

  identifierMD(value) {
    if (value.identifier.isPrimitive) {
      return `\`${value.identifier.name}\``;
    } else if (value.identifier instanceof TBD) {
      if (value.identifier.text && value.identifier.text.length > 0) {
        return `\`${value.identifier.text}\` _(TBD)_`;
      } else {
        return '_(TBD)_';
      }
    }

    return `[\`${value.identifier.name}\`](${this.toURLRelativeToNamespace(value.identifier)})`;
  }

  toURLRelativeToNamespace(identifier) {
    const toParts = identifier.namespace.split('.');
    const fromParts = this._currentNamespace.namespace.split('.');
    const pathParts = [];
    var i;
    for (i=0; i < toParts.length && i < fromParts.length && toParts[i] == fromParts[i]; i++);
    for (let j=fromParts.length-1; j >= i; j--) {
      pathParts.push('..');
    }
    for (; i < toParts.length; i++) {
      pathParts.push(toParts[i]);
    }
    pathParts.push('index.md');
    return pathParts.join('/') + `#${identifier.name}`;
  }
}

function nsTitle(namespace) {
  if (namespace.startsWith('shr.')) {
    namespace = namespace.substr(4);
  }
  const parts = namespace.split('.');
  for (let i=0; i<parts.length; i++) {
    parts[i] = parts[i][0].toUpperCase() + parts[i].substr(1);
  }
  return parts.join(':');
}

function definitionCounts(defs) {
  let elementCount = 0, entryCount = 0;
  for (const def of defs) {
    elementCount++;
    if (def.isEntry) {
      entryCount++;
    }
  }
  return {elementCount, entryCount};
}

function conceptMD(concept) {
  var url;
  switch (concept.system) {
  case 'http://uts.nlm.nih.gov/metathesaurus':
    url = `https://uts.nlm.nih.gov/metathesaurus.html?cui=${concept.code}`;
    break;
  case 'http://snomed.info/sct':
    url = `https://uts.nlm.nih.gov/snomedctBrowser.html?conceptId=${concept.code}`;
    break;
  case 'http://loinc.org':
    url = `http://s.details.loinc.org/LOINC/${concept.code}.html`;
    break;
  case 'http://unitsofmeasure.org':
    url = 'http://unitsofmeasure.org/ucum.html#section-Alphabetic-Index-By-Symbol';
    break;
  default:
    url = `${concept.system}/${concept.code}`;
  }
  let md = `[${concept.code}](${url})`;
  if (concept.display) {
    md = `${md} _(${concept.display})_`;
  }
  return md;
}

function cardinalityMD(value) {
  const card = value.effectiveCard;

  if (!card) {
    return '?'; // This can happen with unresolved incomplete values
  }

  let md = '1';
  if (card.isZeroOrOne) {
    md = 'optional';
  } else if (card.isMaxUnbounded) {
    md = `${card.min}&nbsp;or&nbsp;more`;
  } else if (card.min == card.max) {
    md = `${card.min}`;
  } else {
    md = `${card.min}&nbsp;to&nbsp;${card.max}`;
  }
  return md;
}

function tr(col1='', col2='', col3='') {
  return `| ${col1} | ${col2} | ${col3} |\n`;
}

function indentIt(text, indent) {
  if (indent == 0) return text;
  let indentSpace = '';
  for (let i = 0; i < indent; i++) {
    indentSpace += '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;\\|';
  }
  return `${indentSpace}&nbsp;${text}`;
}

function toURLRelativeToBase(namespace, name) {
  let url = `${namespace.split('.').join('/')}/index.md#`;
  if (name) {
    url += name;
  }
  return url;
}

module.exports = {exportToMarkdown, exportToHTML};