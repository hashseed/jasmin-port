; Bubblesort: sortiert die Zahlen ab daten aufsteigend (siehe Speicher)
jmp programm
bubblesort:
; esi -> erstes Element
; edi -> letztes Element
	mov eax, edi ; außenschleifenzähler
	mov ebx, esi ; innenschleifenzähler
	aussenschleife:
		innenschleife:
			add ebx, 4
			mov edx, [ebx-4]
			cmp [ebx], edx
			jg innenschleifenende
			mov ecx, [ebx]
			mov [ebx], edx
			mov [ebx-4], ecx
			innenschleifenende:
			cmp ebx, eax
			jne innenschleife
		sub eax, 4
		mov ebx, esi
		cmp eax, esi
		jne aussenschleife
	ret

programm:
daten:
dd 12, 14, 15, 1, 12, 11, 44, 345, 35627, 125, 34626, 435, 78, 987345, 234, 235, 151, 236, 234, 2, 25, 2623, 6
dd 12, 14, 15, 1, 12, 11, 44, 345, 35627, 125, 34626, 435, 78, 987345, 234, 235, 151, 236, 234, 2, 25, 2623, 6
dd 12, 14, 15, 1, 12, 11, 44, 345, 35627, 125, 34626, 435, 78, 987345, 234, 235, 151, 236, 234, 2, 25, 2623, 6

datenende:
dd 0
mov esi, daten
mov edi, datenende
sub edi, 4
call bubblesort
