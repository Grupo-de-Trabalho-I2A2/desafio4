// arquivo: src/db/entities/sindicato-valor.ts
import { Entity, PrimaryGeneratedColumn, Column, Index, Unique } from 'typeorm';

@Entity({ name: 'sindicatos_valores' })
@Unique('uq_sv', ['competencia', 'sindicato'])
export class SindicatoValor {
  @PrimaryGeneratedColumn('increment')
  id!: number;

  @Index()
  @Column({ type: 'char', length: 7 })
  competencia!: string; // AAAA-MM

  @Column({ type: 'varchar', length: 256 })
  sindicato!: string;

  // Salva DECIMAL no MySQL, mas no código trabalha como number
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: {
      to: (value: number) => value,          // ao salvar
      from: (value: string) => Number(value) // ao ler
    }
  })
  valor_diario!: number;
}