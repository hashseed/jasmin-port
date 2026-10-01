import { contextHelpFor, helpLinkTarget, lookupHelpPage } from './help-index';

describe('help index', () => {
  const index = { mov: 'MOV.htm', loop: 'LOOP.htm' };

  it('looks mnemonics up case-insensitively (spec 09 §1.1)', () => {
    expect(lookupHelpPage(index, 'MOV')).toBe('MOV.htm');
    expect(lookupHelpPage(index, 'mov')).toBe('MOV.htm');
    expect(lookupHelpPage(index, 'Loop')).toBe('LOOP.htm');
    expect(lookupHelpPage(index, 'FABS')).toBeNull();
    // Only the index's own keys count.
    expect(lookupHelpPage(index, 'constructor')).toBeNull();
    expect(lookupHelpPage(index, '__proto__')).toBeNull();
  });

  it('gives the page or the original "no help" texts (spec 02 §11)', () => {
    expect(contextHelpFor(index, 'MOV')).toEqual({
      kind: 'page',
      mnemonic: 'MOV',
      file: 'MOV.htm',
    });
    expect(contextHelpFor(index, 'FABS')).toEqual({
      kind: 'missing',
      text: 'No help found for FABS',
    });
    expect(contextHelpFor(index, null)).toEqual({
      kind: 'none',
      text: 'No help available for current context.',
    });
  });

  it('recognizes links to other help pages only', () => {
    expect(helpLinkTarget('ADD.htm')).toBe('add');
    expect(helpLinkTarget('./loopz.htm#flags')).toBe('loopz');
    expect(helpLinkTarget('MOV.html')).toBe('mov');
    expect(helpLinkTarget('#credits')).toBeNull();
    expect(helpLinkTarget('https://example.com/ADD.htm')).toBeNull();
    expect(helpLinkTarget('../ADD.htm')).toBeNull();
    expect(helpLinkTarget('javascript:alert(1)')).toBeNull();
  });
});
