mov ebx, 100
mov esi, 3
lea eax, [ebx+esi*4+8]
lea ecx, [ebx-4]
lea edx, [esi*2]
lea edi, [ebx+esi]
mov [ebx+esi*4], 0x11223344
mov ebp, [112]
