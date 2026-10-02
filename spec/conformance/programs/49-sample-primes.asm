; Prime factorization: writes the prime factors of eax to memory from address 0
; 1234567890 = 2 * 3 * 3 * 5 * 3607 * 3803
jmp main
factorize:
	mov ebx, 2
	try_divisor:
		push eax
		mov edx, 0 ; necessary, because div divides edx:eax
		div ebx
		cmp edx, 0
		jz divides
		pop eax
		inc ebx
		jmp try_divisor
	divides:
		pop edx
		mov [ecx], ebx
		add ecx, 4
		cmp eax, 1
		jz done
		mov ebx, 2
		jmp try_divisor
	done:
	ret
main:
mov eax, 1234567890
mov ecx, 0
call factorize
