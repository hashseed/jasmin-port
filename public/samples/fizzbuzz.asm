; Console: prints FizzBuzz from 1 to 100, one line per number: Fizz for
; multiples of 3, Buzz for multiples of 5, FizzBuzz for both.
; Open the Console tab below and press Run.
screen: resb 512 ; the console shows the text at its address, up to the first zero byte
fizz: db 'Fizz', 0
buzz: db 'Buzz', 0
jmp main

; print: copies the zero-terminated string at esi to edi
print:
	mov al, [esi]
	cmp al, 0
	je print_done
	mov [edi], al
	inc esi
	inc edi
	jmp print
	print_done:
	ret

; print_number: writes ecx in decimal to edi
print_number:
	mov eax, ecx
	mov esi, 0 ; number of digits
	mov ebx, 10
	split:
		mov edx, 0
		div ebx ; eax = eax / 10, edx = last digit
		add dl, '0'
		push edx
		inc esi
		cmp eax, 0
		jne split
	join:
		pop edx
		mov [edi], dl
		inc edi
		dec esi
		jne join
	ret

main:
mov edi, screen ; where the next character goes
mov ecx, 1
next_number:
	mov ebx, 0 ; 1 once Fizz or Buzz is printed
	mov eax, ecx
	mov edx, 0
	mov esi, 3
	div esi
	cmp edx, 0
	jne not_fizz
	mov esi, fizz
	call print
	mov ebx, 1
	not_fizz:
	mov eax, ecx
	mov edx, 0
	mov esi, 5
	div esi
	cmp edx, 0
	jne not_buzz
	mov esi, buzz
	call print
	mov ebx, 1
	not_buzz:
	cmp ebx, 0
	jne end_of_line
	call print_number
	end_of_line:
	mov byte [edi], 10
	inc edi
	jasminsleep 100
	inc ecx
	cmp ecx, 101
	jne next_number
