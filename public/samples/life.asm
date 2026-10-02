; Graphics: Conway's Game of Life on the 16 x 16 grid, with edges that wrap around.
; It starts with a glider. Open the Graphics tab below and press Run.
; Click pixels to add or remove cells, even while it runs.
cells: dw 0x0002, 0x0004, 0x0007, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 ; row y is the word at 2*y, pixel x is bit x
next: resw 16 ; the next generation
jmp main

; alive: CF := cell (x, y) with x in ecx and y in edx, both taken modulo 16
alive:
	push ecx
	push edx
	and ecx, 15
	and edx, 15
	bt [edx*2+cells], cx
	pop edx
	pop ecx
	ret

main:
generation:
	mov edx, 0 ; y
	row:
		mov ecx, 0 ; x
		column:
			mov ebx, 0 ; number of live neighbors
			dec edx ; the row above
			dec ecx
			call alive
			adc ebx, 0
			inc ecx
			call alive
			adc ebx, 0
			inc ecx
			call alive
			adc ebx, 0
			inc edx ; the same row
			call alive
			adc ebx, 0
			sub ecx, 2
			call alive
			adc ebx, 0
			inc edx ; the row below
			call alive
			adc ebx, 0
			inc ecx
			call alive
			adc ebx, 0
			inc ecx
			call alive
			adc ebx, 0
			dec ecx ; back to (x, y)
			dec edx
			call alive ; the cell itself
			jc live_cell
			cmp ebx, 3 ; a dead cell with 3 neighbors is born
			je born
			jmp dies
			live_cell:
			cmp ebx, 2 ; a live cell with 2 or 3 neighbors survives
			je born
			cmp ebx, 3
			je born
			dies:
			btr [edx*2+next], cx
			jmp column_done
			born:
			bts [edx*2+next], cx
			column_done:
			inc ecx
			cmp ecx, 16
			jne column
		inc edx
		cmp edx, 16
		jne row
	mov esi, 0 ; copy the next generation to the grid
	copy:
		mov ax, [esi*2+next]
		mov [esi*2+cells], ax
		inc esi
		cmp esi, 16
		jne copy
	jasminsleep 200
	jmp generation
