; Ackermann function (recursive), result in ebx: A(3, 3) = 61
; A(0, n) = n + 1          fall1
; A(m+1, 0) = A(m, 1)      fall2
; A(m+1, n+1) = A(m, A(m+1, n))   fall3
jmp main
ackermann: ; ebx = A(eax, ebx)
   push eax
   cmp eax, 0
   jz case1
   cmp ebx, 0
   jz case2
   jmp case3
   case1:
      inc ebx
      pop eax
      ret
   case2:
      mov ebx, 1
      dec eax
      call ackermann
      pop eax
      ret
   case3:
      dec ebx
      call ackermann
      dec eax
      call ackermann
      pop eax
      ret
main:
mov eax, 3
mov ebx, 3
call ackermann
