mov eax, 0x80000001
rol eax, 1
mov ebx, 0x80000001
ror ebx, 1
clc
mov cl, 0x80
rcl cl, 1
stc
mov dl, 1
rcr dl, 1
