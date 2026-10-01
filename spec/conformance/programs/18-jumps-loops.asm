mov ecx, 4
mov eax, 0
top: add eax, ecx
loop top
cmp eax, 10
je good
mov ebx, 0xBAD
jmp end
good: mov ebx, 0x600D
end: nop
