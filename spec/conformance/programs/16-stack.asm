push 0x1234
push eax
mov eax, 0xDEADBEEF
push eax
pop ebx
pop ecx
pop dx
mov eax, 1
mov ebx, 2
pushad
mov eax, 0
popad
