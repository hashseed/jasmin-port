mov eax, -1
cmp eax, 1
mov ebx, 0
jl less
mov ebx, 1
less: mov ecx, 0
ja above
mov ecx, 1
above: nop
