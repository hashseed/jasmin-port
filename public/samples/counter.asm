; 7-segment display: counts from 0000 to 9999, then wraps around to 0000.
; Open the 7-Segment tab below and press Run.
display: resb 4 ; the display shows these bytes, the rightmost digit first
segments: db 0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F ; 0-9
mov ecx, 0 ; the number shown
mov ebx, 10
next_number:
	mov eax, ecx
	mov esi, 0 ; digit index, 0 = rightmost
	next_digit:
		mov edx, 0
		div ebx ; eax = eax / 10, edx = remainder
		mov dl, [edx+segments]
		mov [esi+display], dl
		inc esi
		cmp esi, 4
		jne next_digit
	jasminsleep 100
	inc ecx
	cmp ecx, 10000
	jne next_number
	mov ecx, 0
	jmp next_number
