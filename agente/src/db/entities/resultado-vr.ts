// arquivo: src/db/entities/resultado-vr.ts
import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity({ name: 'resultado_vr' })
export class ResultadoVR {
  @PrimaryGeneratedColumn('increment')
  id!: number;

  @Index()
  @Column({ type: 'char', length: 7 })
  competencia!: string; // AAAA-MM

  @Index()
  @Column({ type: 'varchar', length: 32 })
  matricula!: string;

  @Column({ type: 'varchar', length: 256 })
  sindicato!: string;

  @Column({ type: 'int' })
  dias_comprar!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  valor_diario!: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  valor_total!: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  custeio_empresa!: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  desconto_colaborador!: string;

  @Column({ type: 'json', nullable: true })
  justificativas!: any | null;

  @Column({ type: 'enum', enum: ['sindicato', 'folha_ponto'], default: 'sindicato' })
  fonte_dias!: 'sindicato' | 'folha_ponto';
}
