mov [0], 0x10
bt dword [0], 4
bts dword [0], 3
btr dword [0], 4
btc dword [0], 0
mov esi, 0x00F0
bsf edi, esi
bsr eax, esi
mov ebx, 0x12345678
bswap ebx
