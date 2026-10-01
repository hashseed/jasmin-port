bytes: db 1, 2, 0x10, 'A'
words: dw 0x1234, 'xy'
dwords: dd 0xDEADBEEF, -1
text: db 'Hello, World', 0
buf: resb 4
after: db 0xEE
mov eax, bytes
mov ebx, text
mov ecx, buf
mov edx, after
mov esi, [dwords]
mov edi, [ebx+4]
