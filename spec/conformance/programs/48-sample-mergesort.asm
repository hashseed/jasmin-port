; Mergesort: sorts the numbers at data in ascending order (see memory)
jmp main
mergesort:
   cmp esi, edi
   jz done
   push edx
   push edx ; start for ecx
   mov ebx, edx ; ebx remembers the position of edx
   mov ecx, esi ; ecx splits the list
   split1:
      cmp ecx, edi
      jg split1_done
      add edx, 4
      mov eax, [ecx]
      mov [edx], eax
      add ecx, 8
      jmp split1
   split1_done:

   mov [climit], edx
   push esi
   push edi
   push dword [climit]
   mov esi, ebx
   add esi, 4
   mov edi, edx

   call mergesort
   pop dword [climit]
   pop edi
   pop esi

   mov ebx, edx
   mov ecx, esi
   add ecx, 4
   push edx ; start for ebx
   split2:
      cmp ecx, edi
      jg split2_done
      add edx, 4
      mov eax, [ecx]
      mov [edx], eax
      add ecx, 8
      jmp split2
   split2_done:
   mov [blimit], edx


   push esi
   push edi
   push dword [blimit]
   push dword [climit]
   mov esi, ebx
   add esi, 4
   mov edi, edx
   call mergesort
   pop dword [climit]
   pop dword [blimit]
   pop edi
   pop esi

   merge:

   mov edx, esi ; edx: destination
   pop ebx
   pop ecx ; ecx source1, ebx source2

   add ecx, 4

   add ebx, 4
   merge_loop:
      cmp edx, edi
      jg done2
      mov eax, [ecx]
      cmp eax, [ebx]
      jl take_c
         mov eax, [ebx]
         mov [edx], eax
         add edx, 4
         cmp ebx, [blimit]
         jge b_done
         add ebx, 4
         jmp merge_loop
         b_done:
         mov ebx, infinity
         jmp merge_loop
      take_c:
         mov [edx], eax
         add edx, 4

         cmp ecx, [climit]
         jge c_done
         add ecx, 4
         jmp merge_loop
         c_done:
         mov ecx, infinity
            jmp merge_loop
   done2:
   pop edx
   done:
   ret

main:
data:
dd 12, 14, 15, 1, 12, 11, 44, 345, 35627, 125, 34626, 435, 78, 987345, 234, 235, 151, 236, 234, 2, 25, 2623, 6

data_end:
dd 0, 0, 0, 0, 0, 0
blimit:
dd 0
climit:
dd 0
infinity:
dd 0x7FFFFFFF
scratch:
dd 0
mov esi, data
mov edi, data_end
sub edi, 4
mov edx, scratch
call mergesort
