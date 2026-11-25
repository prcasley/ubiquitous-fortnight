import test from 'node:test';import assert from 'node:assert/strict';import F from '../assets/radar-county-tax-facts.js';
test('county tax-list rows show published facts in plain form and leave blanks out',()=>{
  const rows=F.rows({zone:'LI',deedDate:'5/4/2026',deedBookPage:'20529/743',salePrice:'368,150',nonusableCode:'04 (List)',lastYearTaxes:'2345.55',landDescription:'48.03 AC.',buildingDescription:'',yearBuilt:''});
  assert.deepEqual(rows,[['Zoning (county tax list)','LI'],['Last recorded deed','May 4, 2026 · Book 20529, page 743'],['Recorded sale price','$368,150 · county non-usable code 04 (List)'],["Last year's taxes",'$2,345.55'],['Land description','48.03 AC.']]);
});
test('placeholders, zero amounts and malformed values never become facts',()=>{
  assert.deepEqual(F.rows({zone:'B3',deedDate:'N/A',deedBookPage:'/',salePrice:'',nonusableCode:'',lastYearTaxes:'94.41',landDescription:'2.85AC',yearBuilt:'0'}),[['Zoning (county tax list)','B3'],["Last year's taxes",'$94.41'],['Land description','2.85AC']]);
  assert.deepEqual(F.rows({zone:'n/a',deedDate:'13/45/2026',salePrice:'0',lastYearTaxes:'abc',yearBuilt:'3020'}),[]);
  assert.deepEqual(F.rows(null),[]);assert.deepEqual(F.rows({owner:'SHOULD NEVER SHOW',mailingAddress:'1 EXAMPLE RD'}),[]);
});
