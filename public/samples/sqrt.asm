; Square root by bisection: eax := square root of eax (unsigned), rounded down;
; counter counts the iterations. The square root of 0xFFFFFFFF is 65535
jmp main
sqrt:
push ebx
push ecx
push edx
push esi
push edi
mov ebx, eax ; ebx = n
mov esi, 0 ; esi = low, low * low <= n
mov edi, 65536 ; edi = high, high * high > n
	bisect:
	inc dword [counter]
	mov ecx, edi
	sub ecx, esi
	cmp ecx, 1
	je finished
	mov eax, esi
	add eax, edi
	mov edx, 0
	div dword [two] ; eax = middle
	mov ecx, eax
	mul eax ; edx:eax = middle * middle
	cmp edx, 0
	jne too_big
	cmp eax, ebx
	ja too_big

	too_small:
	mov esi, ecx
	jmp bisect

	too_big:
	mov edi, ecx
	jmp bisect

	finished:
	mov eax, esi

pop edi
pop esi
pop edx
pop ecx
pop ebx
ret

main:
two:
dd 2
counter:
dd 0
mov eax, -1
call sqrt
