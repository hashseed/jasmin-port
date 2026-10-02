; Quicksort: sorts the numbers at data in ascending order (see memory)
jmp main
quicksort:
   push esi ; start
   push edi ; end
   push edx
   mov eax, edi
   sub eax, [four]
   cmp esi, eax
   jg return
   jz swap

   sub eax, esi
   mov edx, 0 ; necessary, because idiv divides edx:eax
   idiv dword [eight]
   inc eax
   imul dword [four]
   add eax, esi ; eax now points to the middle

   mov ebx, [eax] ; pivot element

   push dword [eax] ; swap pivot to the end
   push dword [edi]
   pop dword [eax]
   pop dword [edi]

   mov eax, esi ; store pointer
   mov ecx, esi ; index pointer
   partition_loop:
      cmp dword [ecx], ebx
      jge next_index
      push dword [ecx]
      push dword [eax]
      pop dword [ecx]
      pop dword [eax]
      add eax, [four]
      next_index:
      add ecx, [four]
      cmp ecx, edi
      jl partition_loop

   push dword [eax] ; swap pivot to the store pointer
   push dword [edi]
   pop dword [eax]
   pop dword [edi]

   mov edx, edi ; remember the end
   mov edi, eax
   call quicksort

   mov esi, edi ; the middle
   add esi, [four]
   mov edi, edx ; the end
   call quicksort
   jmp return
   swap:
      mov ebx, [esi]
      cmp ebx, [edi]
      jl return
      push dword [esi]
      push dword [edi]
      pop dword [esi]
      pop dword [edi]

   return:
   pop edx
   pop edi
   pop esi
   ret

main:
data:
dd 9, 82, 7, 56, 5, 4, 63, 246, 17, 36, 2626, 1533, 55, 43, 32, 26, 34
dd 9, 892, 7, 596, 5, 4, 63, 24, 137, 36, 226, 153, 575, 463, 2, 226, 314
dd 9, 82, 7, 56, 5, 4, 63, 246, 17, 36, 2626, 1533, 55, 43, 32, 26, 34
dd 9, 892, 7, 596, 5, 4, 63, 24, 137, 36, 226, 153, 575, 463, 2, 226, 314
dd 9, 82, 7, 56, 5, 4, 63, 246, 17, 36, 2626, 1533, 55, 43, 32, 26, 34
dd 9, 892, 7, 596, 5, 4, 63, 24, 137, 36, 226, 153, 575, 463, 2, 226, 314
data_end:
dd 0
four:
dd 4
eight:
dd 8
mov esi, data
mov edi, data_end
sub edi, [four]
call quicksort
mov dword [four], 0
mov dword [eight], 0
