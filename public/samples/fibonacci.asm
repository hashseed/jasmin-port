; Fibonacci-Zahlen (rekursiv), Ergebnis in edx: fib(15) = 610
   jmp programm
fibrek:
   push eax
   push ecx
   cmp ecx, 1
   je abbruch
   jecxz abbruch
   jmp normal
abbruch:
   mov edx, ecx
   jmp ende
normal:
   dec ecx
   call fibrek
   mov eax, edx
   dec ecx
   call fibrek
   add edx, eax
ende:
   pop ecx
   pop eax
   ret
programm:
   mov ecx, 15
   call fibrek
