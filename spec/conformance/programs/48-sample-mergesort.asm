; Mergesort: sortiert die Zahlen ab daten aufsteigend (siehe Speicher)
jmp programm
mergesort:
   cmp esi, edi
   jz ende
   push edx
   push edx ; Start für ecx
   mov ebx, edx ; ebx merkt stellung von edx
   mov ecx, esi ; ecx spleißt die liste
   schleife1:
      cmp ecx, edi
      jg weiter1
      add edx, 4
      mov eax, [ecx]
      mov [edx], eax
      add ecx, 8
      jmp schleife1
   weiter1:

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
   push edx ; Start für ebx
   schleife2:
      cmp ecx, edi
      jg weiter2
      add edx, 4
      mov eax, [ecx]
      mov [edx], eax
      add ecx, 8
      jmp schleife2
   weiter2:
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

   zusammenfuegen:

   mov edx, esi ; edx ziel
   pop ebx
   pop ecx ; ecx source1, ebx source2

   add ecx, 4

   add ebx, 4
   schleife3:
      cmp edx, edi
      jg ende2
      mov eax, [ecx]
      cmp eax, [ebx]
      jl kleiner
         mov eax, [ebx]
         mov [edx], eax
         add edx, 4
         cmp ebx, [blimit]
         jge blim
         add ebx, 4
         jmp schleife3
         blim:
         mov ebx, null
         jmp schleife3
      kleiner:
         mov [edx], eax
         add edx, 4

         cmp ecx, [climit]
         jge clim
         add ecx, 4
         jmp schleife3
         clim:
         mov ecx, null
            jmp schleife3
   ende2:
   pop edx
   ende:
   ret

programm:
daten:
dd 12, 14, 15, 1, 12, 11, 44, 345, 35627, 125, 34626, 435, 78, 987345, 234, 235, 151, 236, 234, 2, 25, 2623, 6

datenende:
dd 0, 0, 0, 0, 0, 0
blimit:
dd 0
climit:
dd 0
null:
dd 0x7FFFFFFF
sortierraum:
dd 0
mov esi, daten
mov edi, datenende
sub edi, 4
mov edx, sortierraum
call mergesort
