src: db 'abc', 0
dst: resb 4
mov esi, src
mov edi, dst
mov ecx, 4
cld
rep movsb
mov edi, src
mov al, 'c'
mov ecx, 4
repne scasb
mov ebx, ecx
mov esi, src
lodsb
mov edi, 20
mov eax, 0x41424344
stosd
