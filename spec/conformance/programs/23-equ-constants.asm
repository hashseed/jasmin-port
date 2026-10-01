n: equ 10
k: equ 0x20
mov eax, n
add eax, k
mov ebx, 4
mov ecx, [ebx+k]
mov [k], n
