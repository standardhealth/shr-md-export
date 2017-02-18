const {expect} = require('chai');
const fs = require('fs');
const th = require('shr-test-helpers');
const mdl = require('shr-models');
const {exportToMarkdown} = require('../index');

describe('#exportToMarkdownCommonCases()', th.commonExportTests(importFixture, exportSpecifications));

describe('#exportToMarkdownSpecificCases()', () => {
  it('should correctly export a master index', () => {
    const specs = new mdl.Specifications();
    specs.namespaces.add(new mdl.Namespace('shr.test'));
    let de = new mdl.DataElement(new mdl.Identifier('shr.test', 'Simple'), true)
      .withDescription('It is a simple element')
      .withConcept(new mdl.Concept('http://foo.org', 'bar'))
      .withValue(new mdl.IdentifiableValue(new mdl.PrimitiveIdentifier('string')).withMinMax(1, 1));
    specs.dataElements.add(de);

    de = new mdl.DataElement(new mdl.Identifier('shr.test', 'Coded'), true)
      .withDescription('It is a coded element')
      .withValue(new mdl.IdentifiableValue(new mdl.PrimitiveIdentifier('code')).withMinMax(1, 1)
        .withConstraint(new mdl.ValueSetConstraint('http://standardhealthrecord.org/test/vs/Coded'))
      );
    specs.dataElements.add(de);

    specs.namespaces.add(new mdl.Namespace('shr.other.test'));
    de = new mdl.DataElement(new mdl.Identifier('shr.other.test', 'Simple'), true)
      .withDescription('It is a coded element descending from foobar')
      .withValue(new mdl.IdentifiableValue(new mdl.PrimitiveIdentifier('code')).withMinMax(1, 1)
        .withConstraint(new mdl.ValueSetConstraint('http://standardhealthrecord.org/other/test/vs/Coded'))
      );
    specs.dataElements.add(de);

    let expectedMD = importFixture('index');
    const results = exportToMarkdown(specs);
    expect(splitLines(results.index)).to.eql(expectedMD);
  });
});

function exportSpecifications(specifications) {
  let markdowns = [];
  const results = exportToMarkdown(specifications);
  for (const ns of specifications.namespaces.all) {
    markdowns = markdowns.concat(splitLines(results.namespaces[ns.namespace].index), '');
  }
  return markdowns;
}

function importFixture(name, ext='.md') {
  const fixture = fs.readFileSync(`${__dirname}/fixtures/${name}${ext}`, 'utf8');
  return splitLines(fixture).concat('');
}

function splitLines(text) {
  return text.split('\n').map(l => l.trim());
}
