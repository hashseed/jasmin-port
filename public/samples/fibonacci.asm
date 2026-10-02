; Fibonacci numbers (recursive), result in edx: fib(15) = 610
   jmp main
fib:
   push eax
   push ecx
   cmp ecx, 1
   je base_case
   jecxz base_case
   jmp recurse
base_case:
   mov edx, ecx
   jmp done
recurse:
   dec ecx
   call fib
   mov eax, edx
   dec ecx
   call fib
   add edx, eax
done:
   pop ecx
   pop eax
   ret
main:
   mov ecx, 15
   call fib
