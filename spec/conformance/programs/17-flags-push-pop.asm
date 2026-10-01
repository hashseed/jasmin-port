stc
std
pushf
pop ax
mov ah, 0xD5
sahf
lahf
mov bl, ah
cmc
cld
