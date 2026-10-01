a: db 'abcd'
b: db 'abxd'
mov esi, a
mov edi, b
mov ecx, 4
cld
repe cmpsb
mov eax, ecx
mov ebx, esi
