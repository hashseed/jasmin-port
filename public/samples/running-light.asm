; StripLight: a running light. Open the StripLight tab below and press Run.
; Click the lamps to switch lights on or off, even while it runs.
lamps: dw 0x0007 ; lamp i is bit i, counted from the right
rotate:
	jasminsleep 80
	rol word [lamps], 1
	jmp rotate
