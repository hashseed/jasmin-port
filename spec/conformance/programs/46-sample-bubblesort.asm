; Bubblesort: sorts the numbers at data in ascending order (see memory)
jmp main
bubblesort:
; esi -> first element
; edi -> last element
	mov eax, edi ; outer loop counter
	mov ebx, esi ; inner loop counter
	outer_loop:
		inner_loop:
			add ebx, 4
			mov edx, [ebx-4]
			cmp [ebx], edx
			jg inner_loop_end
			mov ecx, [ebx]
			mov [ebx], edx
			mov [ebx-4], ecx
			inner_loop_end:
			cmp ebx, eax
			jne inner_loop
		sub eax, 4
		mov ebx, esi
		cmp eax, esi
		jne outer_loop
	ret

main:
data:
dd 12, 14, 15, 1, 12, 11, 44, 345, 35627, 125, 34626, 435, 78, 987345, 234, 235, 151, 236, 234, 2, 25, 2623, 6
dd 12, 14, 15, 1, 12, 11, 44, 345, 35627, 125, 34626, 435, 78, 987345, 234, 235, 151, 236, 234, 2, 25, 2623, 6
dd 12, 14, 15, 1, 12, 11, 44, 345, 35627, 125, 34626, 435, 78, 987345, 234, 235, 151, 236, 234, 2, 25, 2623, 6

data_end:
dd 0
mov esi, data
mov edi, data_end
sub edi, 4
call bubblesort
