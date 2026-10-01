a: dq 1.5
b: dq 2.25
fld qword [a]
fld qword [b]
faddp
fstp qword [16]
fld1
fldpi
fmulp
fild dword [c]
c: dd 7
