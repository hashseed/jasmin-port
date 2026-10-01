mov eax, 0
call sub1
call sub1
jmp done
sub1: inc eax
ret
done: mov ebx, esp
