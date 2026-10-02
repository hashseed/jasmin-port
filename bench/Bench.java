package jasmin.harness;
import jasmin.core.*;
import java.nio.file.*;
import java.util.*;

/**
 * Benchmark runner for the original interpreter (bench/README.md):
 *   java jasmin.harness.Bench program.asm [memory bytes]
 * Runs a program the way the original's Run does (JasDocument.run: parser cache
 * cleared, then execute(line, label, lineNumber) per step, no step limit), prints
 * the final state like Run.java on stdout and "steps=<executed lines> ms=<run time>"
 * on stderr. Parsing the program is not timed.
 */
public class Bench implements LabelSource {
  List<String> lines; Map<String,Integer> labels = new HashMap<>();
  DataSpace data; Parser parser; CommandLoader cl;
  public int getLabelLine(String l){ Integer i = labels.get(l); return i==null?-1:i; }
  String lastLabel(int n, ParseResult[] pr){ for(int i=n-1;i>=0;i--){ if(pr[i].empty) continue; if(pr[i].labelOnly) return pr[i].label; break;} return null; }
  public static void main(String[] a) throws Exception { new Bench().go(a[0], a.length>1?Integer.parseInt(a[1]):4096); }
  void go(String file, int memory) throws Exception {
    lines = Arrays.asList(new String(Files.readAllBytes(Paths.get(file))).split("\n",-1));
    data = new DataSpace(memory, 0);
    cl = new CommandLoader(data, "jasmin.commands", JasminCommand.class);
    parser = new Parser(data, cl, this); data.setParser(parser);
    ParseResult[] pr = new ParseResult[lines.size()];
    for (int pass=0; pass<2; pass++) for (int i=0;i<lines.size();i++){ pr[i]=parser.parse(lines.get(i), lastLabel(i,pr)); if(pr[i].label!=null && !labels.containsKey(pr[i].label)) labels.put(pr[i].label,i); }
    String[] labelOf = new String[lines.size()];
    for (int i=0;i<lines.size();i++) labelOf[i] = lastLabel(i,pr);
    long steps=0;
    long start = System.nanoTime();
    parser.clearCache(lines.size());
    while (data.getInstructionPointer() < lines.size()) {
      int ln = data.getInstructionPointer(); data.setInstructionPointer(ln+1); steps++;
      ParseError e = parser.execute(lines.get(ln), labelOf[ln], ln);
      if (e!=null) { System.out.println("ERROR line "+ln+": "+e.errorMsg); break; }
    }
    data.updateDirty();
    long ms = (System.nanoTime()-start)/1000000;
    String[] r={"EAX","EBX","ECX","EDX","ESI","EDI","ESP","EBP","EIP"};
    StringBuilder sb=new StringBuilder();
    for(String x:r) sb.append(x).append('=').append(String.format("0x%08X ", data.getRegisterArgument(x).getShortcut()));
    System.out.println(sb);
    System.out.println("CF="+b(data.fCarry)+" OF="+b(data.fOverflow)+" SF="+b(data.fSign)+" ZF="+b(data.fZero)+" PF="+b(data.fParity)+" AF="+b(data.fAuxiliary)+" DF="+b(data.fDirection));
    StringBuilder m=new StringBuilder("MEM (non-zero bytes):");
    for(int i=0;i<data.getMEMSIZE();i++){ long v=data.getUnsignedMemory(i,1); if(v!=0) m.append(String.format(" %04X:%02X", i, v)); }
    System.out.println(m);
    StringBuilder f=new StringBuilder("FPU:");
    for(int i=0;i<8;i++){ f.append(" ").append(data.fpu.getRegisterName(i)).append("=").append(data.fpu.getRegisterContent(i,10)); }
    System.out.println(f);
    System.err.println("steps="+steps+" ms="+ms);
  }
  static int b(boolean x){return x?1:0;}
}
