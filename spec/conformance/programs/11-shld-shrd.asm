mov eax, 0x12345678
mov ebx, 0x9ABCDEF0
shld eax, ebx, 8
mov ecx, 0x12345678
mov edx, 0x9ABCDEF0
shrd ecx, edx, 8
