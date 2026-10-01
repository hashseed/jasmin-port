package jasmin.harness;
import jasmin.core.*;
import java.nio.file.*;
import java.util.*;
public class Run implements LabelSource {
  List<String> lines; Map<String,Integer> labels = new HashMap<>();
  DataSpace data; Parser parser; CommandLoader cl;
  public int getLabelLine(String l){ Integer i = labels.get(l); return i==null?-1:i; }
  String lastLabel(int n, ParseResult[] pr){ for(int i=n-1;i>=0;i--){ if(pr[i].empty) continue; if(pr[i].labelOnly) return pr[i].label; break;} return null; }
  public static void main(String[] a) throws Exception { new Run().go(a[0], a.length>1?Integer.parseInt(a[1]):100000); }
  void go(String file, int maxSteps) throws Exception {
    lines = Arrays.asList(new String(Files.readAllBytes(Paths.get(file))).split("\n",-1));
    data = new DataSpace(4096, 0);
    cl = new CommandLoader(data, "jasmin.commands", JasminCommand.class);
    parser = new Parser(data, cl, this); data.setParser(parser);
    ParseResult[] pr = new ParseResult[lines.size()];
    for (int pass=0; pass<2; pass++) for (int i=0;i<lines.size();i++){ try { pr[i]=parser.parse(lines.get(i), lastLabel(i,pr)); } catch (Exception ex) { if (pass==1) System.out.println("PARSE-EXCEPTION line "+i+": "+ex.getClass().getSimpleName()); pr[i]=new ParseResult(); pr[i].empty=true; continue; } if(pr[i].label!=null && !labels.containsKey(pr[i].label)) labels.put(pr[i].label,i); }
    for (int i=0;i<lines.size();i++) if (pr[i].error!=null && pr[i].error.errorMsg!=null) System.out.println("PARSE line "+i+": "+pr[i].error.errorMsg+" @"+pr[i].error.startPos+"+"+pr[i].error.length);
    int steps=0;
    while (data.getInstructionPointer() < lines.size() && steps++ < maxSteps) {
      int ln = data.getInstructionPointer(); data.setInstructionPointer(ln+1);
      ParseError e;
      try { e = parser.execute(lines.get(ln), lastLabel(ln,pr), -1); } catch (Exception ex) { System.out.println("EXCEPTION line "+ln+": "+ex.getClass().getSimpleName()+": "+ex.getMessage()); break; }
      if (e!=null) { System.out.println("ERROR line "+ln+": "+e.errorMsg); break; }
    }
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
  }
  static int b(boolean x){return x?1:0;}
}
