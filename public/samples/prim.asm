; Primzahlzerlegung: schreibt die Primfaktoren von eax ab Adresse 0 in den Speicher
; 1234567890 = 2 * 3 * 3 * 5 * 3607 * 3803
jmp programm
zerlegen:
	mov ebx, 2
	schleife:
		push eax
		mov edx, 0 ; nötig, weil div edx:eax teilt
		div ebx
		cmp edx, 0
		jz teilen
		pop eax
		inc ebx
		jmp schleife
	teilen:
		pop edx
		mov [ecx], ebx
		add ecx, 4
		cmp eax, 1
		jz ende
		mov ebx, 2
		jmp schleife
	ende:
	ret
programm:
mov eax, 1234567890
mov ecx, 0
call zerlegen
