; Quicksort: sortiert die Zahlen ab daten aufsteigend (siehe Speicher)
jmp programm
quicksort:
   push esi ; Anfang
   push edi ; Ende
   push edx
   mov eax, edi
   sub eax, [vier]
   cmp esi, eax
   jg zurueck
   jz tauschen

   sub eax, esi
   mov edx, 0 ; nötig, weil idiv edx:eax teilt
   idiv dword [acht]
   inc eax
   imul dword [vier]
   add eax, esi ; eax zeigt jetzt auf die Mitte

   mov ebx, [eax] ; Pivotelement

   push dword [eax] ; Pivot ans Ende tauschen
   push dword [edi]
   pop dword [eax]
   pop dword [edi]

   mov eax, esi ; Speicherzeiger
   mov ecx, esi ; Indexzeiger
   schleife:
      cmp dword [ecx], ebx
      jge schleifenschluss
      push dword [ecx]
      push dword [eax]
      pop dword [ecx]
      pop dword [eax]
      add eax, [vier]
      schleifenschluss:
      add ecx, [vier]
      cmp ecx, edi
      jl schleife

   push dword [eax] ; Pivot zum Speicherzeiger tauschen
   push dword [edi]
   pop dword [eax]
   pop dword [edi]

   mov edx, edi ; Ende merken
   mov edi, eax
   call quicksort

   mov esi, edi ; die Mitte
   add esi, [vier]
   mov edi, edx ; das Ende
   call quicksort
   jmp zurueck
   tauschen:
      mov ebx, [esi]
      cmp ebx, [edi]
      jl zurueck
      push dword [esi]
      push dword [edi]
      pop dword [esi]
      pop dword [edi]

   zurueck:
   pop edx
   pop edi
   pop esi
   ret

programm:
daten:
dd 9, 82, 7, 56, 5, 4, 63, 246, 17, 36, 2626, 1533, 55, 43, 32, 26, 34
dd 9, 892, 7, 596, 5, 4, 63, 24, 137, 36, 226, 153, 575, 463, 2, 226, 314
dd 9, 82, 7, 56, 5, 4, 63, 246, 17, 36, 2626, 1533, 55, 43, 32, 26, 34
dd 9, 892, 7, 596, 5, 4, 63, 24, 137, 36, 226, 153, 575, 463, 2, 226, 314
dd 9, 82, 7, 56, 5, 4, 63, 246, 17, 36, 2626, 1533, 55, 43, 32, 26, 34
dd 9, 892, 7, 596, 5, 4, 63, 24, 137, 36, 226, 153, 575, 463, 2, 226, 314
datenende:
dd 0
vier:
dd 4
acht:
dd 8
mov esi, daten
mov edi, datenende
sub edi, [vier]
call quicksort
mov dword [vier], 0
mov dword [acht], 0
