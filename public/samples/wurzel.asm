; Quadratwurzel durch Intervallhalbierung: eax := abgerundete Wurzel von eax
; (vorzeichenlos), zaehler zählt die Schleifendurchläufe. Wurzel von 0xFFFFFFFF = 65535
jmp programm
wurzel:
push ebx
push ecx
push edx
push esi
push edi
mov ebx, eax ; ebx = n
mov esi, 0 ; esi = unten, unten * unten <= n
mov edi, 65536 ; edi = oben, oben * oben > n
	schleife:
	inc dword [zaehler]
	mov ecx, edi
	sub ecx, esi
	cmp ecx, 1
	je fertig
	mov eax, esi
	add eax, edi
	mov edx, 0
	div dword [zwei] ; eax = Mitte
	mov ecx, eax
	mul eax ; edx:eax = Mitte * Mitte
	cmp edx, 0
	jne groesser
	cmp eax, ebx
	ja groesser

	kleiner:
	mov esi, ecx
	jmp schleife

	groesser:
	mov edi, ecx
	jmp schleife

	fertig:
	mov eax, esi

pop edi
pop esi
pop edx
pop ecx
pop ebx
ret

programm:
zwei:
dd 2
zaehler:
dd 0
mov eax, -1
call wurzel
